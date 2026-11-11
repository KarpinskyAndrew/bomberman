# BomberMan Online: CI/CD and v1 Deployment

| | |
|---|---|
| **Version** | 0.3 (draft) |
| **Date** | 2026-11-11 |
| **Parent** | [SPECIFICATION.md](./SPECIFICATION.md) |

**Changes in 0.3:**

- **v1 is one server.** Everything runs on a single **Compute Engine VM** with **Docker Compose**: Caddy, Envoy, API, game server, rating worker, PostgreSQL and the observability containers. Cloud Run, Cloud SQL, Cloud Deploy, staging/prod projects and Cloud CDN are gone from v1.
- **Terraform is dropped.** The few GCP resources v1 needs are created once with the `gcloud` commands in §8. GKE + **Helm** (and IaC, if wanted) arrive with v2 (§9).
- **CI/CD runs on GitHub Actions**. GitHub authenticates to GCP through **Workload Identity Federation**, so no service-account keys exist.
- Migrations use **Goose**.

**Short answer:** GitHub Actions runs CI on every PR. A fast-forward of `dev` into `main` builds the images, pushes them to **Artifact Registry** and, after a manual approval, deploys them to the VM with `docker compose`. Pub/Sub, Cloud Storage, Secret Manager, Cloud Logging and Cloud Trace are the only managed GCP services v1 uses.

---

## 1. Overview

```
 GitHub (public repo)
   │  PR → dev or main opened/updated ─► Actions: ci.yml  (lint, test, build check) ──► required status check
   │                                     (fork PRs: read-only token, no secrets; first-time contributors need approval)
   │
   │  fast-forward dev → main ─────────► Actions: release.yml
   │                                        ├─ test again, build images (api, gameserver, worker, migrate, web)
   │                                        ├─ push → Artifact Registry (europe-west3), tagged with the commit SHA
   │                                        └─ deploy job ── environment "production" (manual approval)
   │                                                 │
   │                                                 ▼  gcloud compute ssh --tunnel-through-iap
   │                          ┌──────────── GCE VM "bomberman-1" (europe-west3) ─────────────┐
   │                          │ 1. fetch secrets → /opt/bomberman/.env                        │
   │                          │ 2. docker compose pull                                       │
   │                          │ 3. docker compose run --rm migrate      (Goose up)           │
   │                          │ 4. docker compose up -d                 (changed services)   │
   │                          │ 5. smoke check: /readyz + guest login + bot match            │
   │                          └──────────────────────────────────────────────────────────────┘
   │
   └  nightly schedule ────────────────► Actions: nightly.yml (long fuzzing, govulncheck, npm audit, backup restore test)
```

The landing page workflow (`.github/workflows/pages.yml`, GitHub Pages) stays as it is.

---

## 2. GCP Project & Identity

v1 uses **one GCP project**, `bomberman-prod`, with every resource in **`europe-west3` (Frankfurt)** or the `EU` multi-region (spec §8.1). Development happens locally with Docker Compose, so there is no separate staging project in v1.

| Resource | Purpose |
|---|---|
| Compute Engine VM `bomberman-1` | Runs the whole stack (§6). `e2-standard-4`, Ubuntu LTS or Container-Optimized OS, 50 GB balanced persistent disk for Postgres data, static external IP. |
| Artifact Registry `europe-west3-docker.pkg.dev/bomberman-prod/images` | Container images, cleanup policy keeps the last 30 tags per image |
| Pub/Sub topics `match-events`, `match-events-dlq` | Durable domain events ([Events §4–§7](./EVENTS-AND-MESSAGING.md)) |
| Cloud Storage buckets `bomberman-backups` (EU), `bomberman-replays` (EU) | Nightly `pg_dump` files and round input logs |
| Secret Manager | DB passwords, JWT signing key, Sentry DSN |
| Cloud Logging / Cloud Trace | Container logs (Ops Agent) and traces (OpenTelemetry Collector) |

**Service accounts** (least privilege, no keys anywhere):

| Service account | Used by | Permissions |
|---|---|---|
| `gha-release@` | GitHub Actions `release.yml`, through Workload Identity Federation | Push to Artifact Registry, `compute.osAdminLogin` + IAP tunnel user on the VM only |
| `vm-runtime@` | The VM (attached service account) | Read Artifact Registry, Pub/Sub publisher on `match-events` + subscriber on `rating-worker`, read the listed secrets, write the backup and replay buckets, write logs and traces |

- The Workload Identity pool trusts **only** this repository and only the `production` environment (`attribute.repository == "KarpinskyAndrew/bomberman"` and `assertion.environment == "production"`). A fork or a PR workflow can't get a GCP token.
- **v1 limitation:** every container on the VM shares the VM's service account. Separation between services is enforced by **database roles** ([DATABASE §7](./DATABASE.md#7-roles-and-privileges)) and by which binaries hold Pub/Sub clients, not by IAM. Per-service identities arrive with GKE Workload Identity in v2.
- The VM has **no SSH port open to the internet**. SSH only goes through IAP (`35.235.240.0/20`) with OS Login. Only ports 80 and 443 are public.

---

## 2a. Public Repository Safeguards

The source is public, so anyone can read it, fork it and open PRs. The pipeline makes sure this never exposes credentials or infrastructure:

| Risk | Safeguard |
|---|---|
| Untrusted code from fork PRs runs in CI | `ci.yml` uses the **`pull_request`** event (never `pull_request_target`), so fork PRs get a **read-only `GITHUB_TOKEN` and no secrets**. Repository setting: *Require approval for all outside collaborators* before their workflows run. `ci.yml` needs no GCP access at all. |
| Deploy credentials | Only the `production` **environment** can obtain a GCP token (§2). The environment is limited to the `main` branch and needs a reviewer's approval, so a workflow file changed in a PR can't deploy. |
| Secrets committed by mistake | No secrets, `.env` files, keys or `local.env` are committed (enforced by `.gitignore`). GitHub **secret scanning** and **push protection** are on. Runtime secrets exist only in Secret Manager. |
| Third-party actions | Actions are pinned to a **full commit SHA** (Dependabot updates them). Every workflow sets `permissions:` explicitly, starting from `contents: read`. |
| Build logs | Logs of a public repo's Actions runs are public. Workflows never print secrets or the generated `.env` (GitHub masks registered secrets, and the deploy script doesn't echo). |
| Vulnerable dependencies | **Dependabot** alerts and security updates for Go modules, npm and GitHub Actions, plus `govulncheck` and `npm audit` nightly (§4.4). |
| Unreviewed changes reaching `dev` or `main` | Branch rulesets (§3a): changes arrive only through PRs, with the `ci` check and a maintainer review required. Force-pushes and deletions are blocked. |
| Resource names in docs and workflows | Project IDs, bucket names and regions are not secret and may stay in the repo. Access is controlled by IAM, not by hiding names. |

The license is the Business Source License 1.1 (§10). Open items for going public: add `SECURITY.md` (how to report vulnerabilities privately) and `CONTRIBUTING.md` (the branching rules from §3a). See §10.

---

## 3. Repository Layout for CI/CD

```
/.github/
  workflows/
    ci.yml               PR checks
    release.yml          main: test, build, push, deploy (approval)
    nightly.yml          long fuzzing, dependency audit, backup restore test
    pages.yml            landing page (existing)
  dependabot.yml         gomod, npm, github-actions
/deploy/
  compose.yaml           production stack (§6), images referenced by ${IMAGE_TAG}
  caddy/Caddyfile        TLS (Let's Encrypt), static web bundle, reverse proxy
  envoy/envoy.yaml       gRPC-Web → gRPC translation
  otel/collector.yaml    OpenTelemetry Collector: traces → Cloud Trace
  prometheus/            prometheus.yml, alert rules
  grafana/               provisioned dashboards (tick p99, RTT, rating lag)
  postgres/init/         first-start scripts: create login roles (DATABASE §7)
  scripts/
    deploy.sh            runs on the VM: secrets → pull → migrate → up → smoke
    fetch-secrets.sh     Secret Manager → /opt/bomberman/.env (root-only, 0600)
    backup.sh            pg_dump → gs://bomberman-backups (systemd timer, nightly)
  vm/                    one-time VM setup: Docker, Ops Agent, systemd units
/server/Dockerfile       multi-stage; targets: api, gameserver, worker, migrate (distroless/static, non-root)
/web/Dockerfile          builds the bundle; final stage is the Caddy image with the bundle baked in
/server/test/compose.yaml  Postgres 17 + Pub/Sub emulator for integration tests (CI and local)
```

---

## 3a. Branching & Merge Model

```
feature/<topic>  ─┐
bugfix/<topic>   ─┼─ PR, squash merge ─► dev ─── fast-forward only ───► main ──► release.yml
                 ─┘   (1 commit per PR)        (no merge commits)
```

| Branch | Purpose | How changes arrive |
|---|---|---|
| `feature/<topic>`, `bugfix/<topic>` | One change each, branched from `dev` | Direct commits by the author |
| `dev` | Integration branch, always green | PRs only, **squash merged**, so each PR becomes one linear commit. Rebase the branch on `dev` first if it is behind. |
| `main` | What gets released. Every commit is deployable. | **Fast-forward only** from `dev`, never a merge commit or squash. |

- **Feature → dev:** use GitHub "Squash and merge". Only the repo owner merges PRs, after reviewing the diff.
- **dev → main:** GitHub's PR merge buttons always create new commits, so the fast-forward is done with git:
  ```bash
  git fetch origin
  git push origin origin/dev:main     # rejected by git if it is not a fast-forward
  ```
  `main` and `dev` then point at the same commit. A dev → main PR can still be opened for review and the CI check, then closed after the push.
- **Repository settings:** allow only **squash merging** for PRs, and turn on "Automatically delete head branches".
- **Rulesets:**
  - `dev`: require a PR, the `ci` check and 1 approval.
  - `main`: require linear history, block force-pushes and deletions, and allow only maintainers to push. That push is the fast-forward.
- **Hotfixes:** create `bugfix/*` from `dev`, merge it, then fast-forward `main`. Nothing goes directly into `main`.

---

## 4. Pipelines

### 4.1 CI: pull requests (`ci.yml`)

| Setting | Value |
|---|---|
| Trigger | `pull_request` to `dev` or `main`, plus `push` to `dev` (keeps the branch badge honest) |
| Permissions | `contents: read` only. No GCP access, no secrets. |
| Status | The summary job `ci` is a **required status check** in the rulesets |
| Concurrency | `group: ci-${{ github.ref }}`, `cancel-in-progress: true`, so a new push cancels the old run |

Jobs run in parallel:

| Job | Tooling |
|---|---|
| `go-lint` | `golangci-lint run` (includes `go vet`) |
| `go-test` | `go test -race -count=1 ./...` (simulation, rating, match logic, codec; testify + mockery mocks) |
| `go-integration` | `docker compose -f server/test/compose.yaml up -d --wait` (**Postgres 17 + Pub/Sub emulator**), then `go test -tags=integration -count=1 ./...`: Goose migrations on an empty DB, constraint tests, inbox idempotency |
| `fuzz-short` | `go test -fuzz=. -fuzztime=30s ./internal/proto` |
| `web` | `npm ci`, `eslint`, `vue-tsc`, `vitest --run`, `vite build` |
| `contract` | Go & TS golden-vector tests for the codec. **Rule vectors:** a Go test reruns `cmd/vectorgen` and fails if `/protocol/testdata/rules` is stale; Vitest replays them through the TS prediction subset. **buf:** `buf lint`, `buf breaking` against the PR's base branch for `protocol/api` and `protocol/events`, and `buf generate` + `git diff --exit-code` so the committed generated code is current. `mockery` + `git diff --exit-code` does the same for mocks. |
| `docker-build` | `docker buildx build` of all targets (no push), with the GitHub Actions cache backend |
| `ci` | `needs:` all of the above. This is the one job the rulesets require. |

**Target duration:** under 10 min. Go modules, the Go build cache and npm are cached with `actions/setup-go` / `actions/setup-node` caching.

```yaml
# .github/workflows/ci.yml (abridged; pin actions to a full SHA in the real file)
name: ci
on:
  pull_request:
    branches: [dev, main]
  push:
    branches: [dev]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  go-test:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: server } }
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-go@v6
        with: { go-version-file: server/go.mod, cache-dependency-path: server/go.sum }
      - run: go test -race -count=1 ./...
  go-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-go@v6
        with: { go-version-file: server/go.mod, cache-dependency-path: server/go.sum }
      - run: docker compose -f server/test/compose.yaml up -d --wait
      - working-directory: server
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/test?sslmode=disable
          PUBSUB_EMULATOR_HOST: localhost:8085
        run: go test -tags=integration -count=1 ./...
  web:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: web } }
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: npm, cache-dependency-path: web/package-lock.json }
      - run: npm ci && npm run lint && npm run typecheck && npm run test -- --run && npm run build
  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }              # buf breaking needs the base branch
      - uses: bufbuild/buf-action@v1
        with:
          input: protocol
          breaking_against: '.git#branch=origin/${{ github.base_ref || ''dev'' }},subdir=protocol'
      # … vectorgen staleness test, buf generate / mockery diff checks
  ci:
    if: always()
    needs: [go-test, go-integration, web, contract]   # + go-lint, fuzz-short, docker-build
    runs-on: ubuntu-latest
    steps:
      - run: '[ "${{ contains(needs.*.result, ''failure'') || contains(needs.*.result, ''cancelled'') }}" = "false" ]'
```

### 4.2 Release: push to `main` (`release.yml`)

The workflow runs on every push to `main`. With the §3a model, that only happens when `dev` is fast-forwarded into `main`, so every release is a commit that already passed CI on `dev`.

| Job | What it does |
|---|---|
| `test` | Re-runs the fast checks (unit tests, lint) as a safety net |
| `build` | Builds `api`, `gameserver`, `worker`, `migrate` and `web` images tagged with `${{ github.sha }}`. It authenticates with `google-github-actions/auth` (Workload Identity Federation, environment `production`) and pushes to Artifact Registry. `docker/build-push-action` attaches **SBOM and provenance** attestations. |
| `deploy` | `environment: production` → waits for a **required reviewer** to approve. Then `gcloud compute ssh bomberman-1 --tunnel-through-iap -- sudo /opt/bomberman/deploy.sh <sha>`. |

```yaml
# .github/workflows/release.yml (abridged)
on:
  push:
    branches: [main]
  workflow_dispatch:                  # manual run = redeploy / rollback (§7)
    inputs:
      image_tag: { description: 'Commit SHA to deploy', required: false }
permissions:
  contents: read
  id-token: write                     # for Workload Identity Federation
concurrency:
  group: release                      # one deploy at a time, never cancelled midway
  cancel-in-progress: false
jobs:
  deploy:
    needs: [build]
    environment: production           # required reviewer + main-only
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: projects/<number>/locations/global/workloadIdentityPools/github/providers/bomberman
          service_account: gha-release@bomberman-prod.iam.gserviceaccount.com
      - uses: google-github-actions/setup-gcloud@v3
      - run: >
          gcloud compute ssh bomberman-1 --zone=europe-west3-a --tunnel-through-iap
          --command="sudo /opt/bomberman/deploy.sh ${{ inputs.image_tag || github.sha }}"
```

### 4.3 What `deploy.sh` does on the VM

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/bomberman
export IMAGE_TAG="$1"
./fetch-secrets.sh                                   # Secret Manager → .env (0600)
docker compose pull
docker compose run --rm migrate                      # Goose up; takes an advisory lock, no-op when current
docker compose up -d --remove-orphans                # recreates only services whose image or config changed
./smoke.sh                                           # /readyz, guest token, bot match through the rating pipeline
echo "$IMAGE_TAG" > deployed.tag                     # previous value is kept in deployed.tag.prev for rollback
```

- **Migrations first.** Goose runs before the new code starts. Because migrations follow expand → contract (§5), the old containers keep working against the new schema while the new ones start.
- **Smoke check:** (1) `GET /readyz` on every service; (2) a guest token from the API; (3) `cmd/bots` plays a short ranked match between 2 bot accounts and asserts that the ratings changed through the Pub/Sub → worker → DB path within 10 s. If the smoke check fails, the script redeploys `deployed.tag.prev` and the workflow fails.
- The **compose files and scripts** in `/deploy` are copied to the VM by the same SSH step (`gcloud compute scp`), so the VM never has a checkout of the repo.

### 4.4 Nightly (`nightly.yml`, `schedule:` cron)

- Long fuzzing: 10 min per target.
- `govulncheck`, `npm audit`, and a check that the base images are up to date.
- **Load test** (manual `workflow_dispatch` only, not nightly, because v1 has no staging and the only target is prod): `cmd/bots` runs 800 bot players against a compose stack started inside the runner. It reports tick p99, RTT and allocations, and fails if they exceed the NFR thresholds.
- Weekly: a **restore test**. The latest `pg_dump` from `gs://bomberman-backups` is restored into a throwaway Postgres 17 container, and `goose status` plus a few row counts are checked. This job needs read access to the bucket, so it runs in a `backups` environment with its own narrow WIF binding.

---

## 5. Database Migrations Policy

- Migrations live in `server/internal/store/migrations/` as **Goose** SQL files (`-- +goose Up` / `-- +goose Down`). They are embedded in the `migrate` image and applied by `cmd/migrate` (Goose's Go library, `goose.Up`).
- Migrations are forward-only, with an **expand → migrate → contract** sequence:
  1. Add the new column or table (nullable or defaulted).
  2. Deploy code that writes both the old and new shape and reads the new one.
  3. Drop the old shape in a later release.
- As a result, **the previous release always works with the new schema**, so a rollback never needs a down-migration. `-- +goose Down` sections are kept only for local development.
- CI runs every migration `up` on an empty DB. Before a schema-heavy release, run it against a restored copy of the latest backup as well (the weekly restore job does this automatically).

---

## 6. The v1 Server

### 6.1 Compose stack on the VM

| Service | Image | Exposed | Notes |
|---|---|---|---|
| `caddy` | `web` image (Caddy + the Vue bundle) | **:80, :443** | Automatic HTTPS (Let's Encrypt), HTTP/2 + HTTP/3. Serves the SPA (`index.html` `no-cache`, hashed assets cached for a year). Routes `/play` (WebSocket) → `gameserver`, `/api/auth/*`, `/healthz`, `/ping` → `api` (Gin), `/bomberman.*` gRPC-Web paths → `envoy`. |
| `envoy` | `envoyproxy/envoy` | internal | `envoy.filters.http.grpc_web` + CORS, forwards gRPC to `api:9090` |
| `api` | `api` | internal | Gin on :8080 (auth, health), gRPC on :9090 |
| `gameserver` | `gameserver` | internal | WebSocket on :8081. `stop_grace_period: 2m` (§6.2). |
| `worker` | `worker` | internal | Pub/Sub **pull** subscriber, daily housekeeping |
| `migrate` | `migrate` | – | One-shot, `profiles: [tools]`, run by `deploy.sh` |
| `postgres` | `postgres:17` | internal | Data on the persistent disk (`/mnt/pgdata`). Login roles created by `deploy/postgres/init` on first start. |
| `otel-collector` | `otel/opentelemetry-collector-contrib` | internal | OTLP in → traces to **Cloud Trace** |
| `prometheus` | `prom/prometheus` | internal | Scrapes `/metrics` of api, gameserver, worker, envoy, caddy. 15-day retention. |
| `grafana` | `grafana/grafana` | via Caddy at `/grafana`, behind Grafana login | Provisioned dashboards and alert rules (§7) |

- Every service except `caddy` is on an internal Docker network only. Postgres is never published to the host.
- Container logs go to **Cloud Logging** through the Ops Agent on the VM. Services log JSON with `log/slog`, so fields such as `matchId` stay searchable.
- Errors from Go and from the Vue app go to **Sentry** (SaaS, free tier), with the release set to the commit SHA.

### 6.2 Game server deploys (v1 caveat)

- In v1 there is one game server with arenas in memory. Replacing its container ends in-progress matches, which are then unrated (spec §5.4.2).
- **Mitigations:**
  - `deploy.sh` only recreates the game server when its image changed, so API- or web-only releases don't touch running matches.
  - Prod deploys that include the game server are approved for a **deploy window**, during low-traffic hours.
  - On `SIGTERM` the server broadcasts `server.draining` ("maintenance in 2 min"), stops starting new matches, lets running rounds finish within the 2-minute `stop_grace_period`, and flushes the Pub/Sub spool.
  - Clients reconnect and resume to the new container automatically.
- **v2 (GKE):** pods drain gracefully over a longer grace period (Server & Network §7). Running matches finish on old pods while new arenas go to new pods, so deploys need no window.

### 6.3 Backups

- `backup.sh` runs nightly from a systemd timer: `pg_dump -Fc` → `gs://bomberman-backups/YYYY/MM/DD.dump`, with a bucket lifecycle rule that keeps 30 days.
- A **daily persistent-disk snapshot schedule** covers the whole VM disk as a second layer.
- **RPO** is therefore up to 24 h for profiles and accounts. Match results are safer than that: anything not yet in the DB is still in Pub/Sub (7-day retention), and could be replayed after a restore by seeking the subscription back.

---

## 7. Rollback, Notifications, Observability

| Area | How |
|---|---|
| Rollback | Run `release.yml` manually (`workflow_dispatch`) with `image_tag` = the previous good SHA (it is in `deployed.tag.prev` and in the Actions history). Images stay in Artifact Registry. No down-migrations are needed (§5). |
| Notifications | GitHub sends failure and approval-request notifications (email or the GitHub mobile app). Grafana alert rules notify by email. |
| Metrics & dashboards | Prometheus + Grafana on the VM: tick p99, RTT, error rate, Pub/Sub spool depth, rating lag ([Server & Network §9](./SERVER-AND-NETWORK.md#9-observability--netcode-testing), [Events §10](./EVENTS-AND-MESSAGING.md#10-observability)). |
| Traces | OpenTelemetry SDK in each Go service → collector → **Cloud Trace**. The trace context travels inside the `match.finished` event, so match end → publish → rating commit is one trace. |
| Errors | **Sentry** for Go (panics, 5xx, gRPC `Internal`) and Vue (uncaught errors, failed calls). |
| Uptime | A Cloud Monitoring **uptime check** on `https://<domain>/healthz` from outside the VM, because an alert from inside a dead VM never fires. |
| Deploy markers | `deploy.sh` posts a Grafana annotation with the SHA, so dashboards show when each deploy happened. |

---

## 8. Bootstrap Steps (one-time)

Without Terraform these steps are run by hand once, and kept in `deploy/vm/README.md` as the runbook:

1. **Repository** (done): public GitHub repo with `dev` as the default branch. Turn on secret scanning, push protection and Dependabot (§2a). Create the `production` environment: required reviewer = owner, deployment branches = `main` only.
2. **Project:** create `bomberman-prod`, link billing, enable the APIs: Compute Engine, Artifact Registry, Pub/Sub, Secret Manager, IAM Credentials, Cloud Logging, Cloud Trace, Cloud Monitoring.
3. **Registry, topics, buckets, secrets:** `gcloud artifacts repositories create images --location=europe-west3 …`, `gcloud pubsub topics create match-events …` (+ DLQ, subscription `rating-worker` with dead-lettering and the Protobuf schema), `gcloud storage buckets create gs://bomberman-backups --location=EU …`, `gcloud secrets create …`.
4. **Service accounts and Workload Identity Federation** for GitHub (§2): create the pool and provider with the repository and environment conditions, and bind `gha-release@` to it.
5. **VM:** reserve a static IP, create `bomberman-1` with `vm-runtime@` attached, a separate data disk for Postgres, and firewall rules for 80/443 plus IAP SSH. Run `deploy/vm/setup.sh` once (Docker, compose plugin, Ops Agent, systemd timers).
6. **DNS:** point the domain at the static IP. Caddy gets the certificate on its first start.
7. **First release:** fast-forward `dev` into `main`, approve the deploy, and watch the smoke check.
8. **Rulesets:** configure GitHub rulesets as described in §3a. Set PR merges to squash only.

**Cost** (check the current pricing pages before relying on these numbers):

- **GitHub Actions** is free for public repositories on GitHub-hosted runners.
- The **VM** is the main cost. An `e2-standard-4` running all month is roughly 100 USD; a 1-year committed-use discount or starting on `e2-standard-2` cuts that substantially. The disk, static IP and snapshots add a few dollars.
- **Pub/Sub, Cloud Trace, Cloud Logging, Secret Manager and Artifact Registry** stay inside or close to their free tiers at launch scale.
- **Sentry** free tier.

---

## 9. Path to v2 (scaling up)

v1 is deliberately small. When a single server is no longer enough, the same images move to Kubernetes:

| v1 (one VM) | v2 |
|---|---|
| Docker Compose | **GKE** (Autopilot or Standard) with **Helm** charts per service, one values file per environment |
| Postgres container + `pg_dump` | **Cloud SQL for PostgreSQL 17** (HA, PITR), migrated with a dump/restore during a maintenance window |
| Caddy + Envoy containers | GKE Gateway / Ingress for HTTP, Envoy (or the gateway) for gRPC-Web, a passthrough Network LB for the game gateway (Server & Network §8.2) |
| In-process lobby hub | **Redis** (Memorystore) directory and pub/sub |
| VM service account for everything | **Workload Identity** per service account |
| Prometheus + Grafana on the VM | Google Cloud Managed Service for Prometheus + Cloud Monitoring dashboards |
| One environment | `staging` + `prod`; deploys with `helm upgrade --atomic` from GitHub Actions, canary for the API |
| `gcloud` runbook | Infrastructure as code becomes worth it again (Terraform or Config Connector) once there are several environments |

Because the transport, publisher and store are behind interfaces, none of this changes the game code.

---

## 10. Open Questions

**Resolved:**

- **Git hosting and CI:** a public GitHub repository with GitHub Actions (§2a, §4), using the branching model in §3a.
- **v1 hosting:** one Compute Engine VM with Docker Compose (§6). No Terraform in v1.
- **License:** source-available under the **Business Source License 1.1** (`LICENSE`), Additional Use Grant *None*, so no production use by others, and Change License GPL-3.0-or-later. A version converts on the Change Date or four years after it was first published, whichever comes first. Moving the Change Date forward to "release date + 4 years" at each release keeps the full window; that is a manual edit of `LICENSE`.

**Still open:**

1. **Domain name** for the game (the landing page uses `bomberman.space`).
2. **Game server deploy window (v1):** which time of day? For example 05:00–06:00 CET.
3. **VM size at launch:** `e2-standard-2` (cheaper) or `e2-standard-4` (headroom for the 200-arena target, spec §5.3).
