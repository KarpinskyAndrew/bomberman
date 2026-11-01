# BomberMan Online: CI/CD on Google Cloud

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Date** | 2026-10-27 |
| **Parent** | [SPECIFICATION.md](./SPECIFICATION.md) |

**Short answer:** yes, the whole pipeline can run on GCP using **Cloud Build** (CI, triggers), **Artifact Registry** (images), **Cloud Deploy** (staging → prod promotion, approvals, canary, rollback) and **Terraform** run from Cloud Build (infrastructure). The only part outside GCP is the Git hosting itself (see §9).

---

## 1. Overview

```
 GitHub (private repo)
   │  PR opened/updated ───────────────► Cloud Build: ci.yaml  (lint, test, build check) ──► status check on PR
   │  merge to main ───────────────────► Cloud Build: release.yaml
   │                                        ├─ test again, build images (api, gameserver, worker, migrate)
   │                                        ├─ push → Artifact Registry (europe-west3) + SLSA provenance + vuln scan
   │                                        ├─ build web bundle → GCS artifacts bucket
   │                                        └─ gcloud deploy releases create  (one per deployable)
   │                                                   │
   │                                     Cloud Deploy  ▼
   │                         ┌──────────── staging (auto) ────────────┐
   │                         │ predeploy: DB migrations                │
   │                         │ deploy: Cloud Run / GCS+CDN             │
   │                         │ verify: smoke E2E + bot match + rating  │
   │                         └───────────────┬────────────────────────┘
   │                                         │  manual approval (prod approvers)
   │                         ┌───────────────▼────────────────────────┐
   │                         │ prod: canary 10 % → 50 % → 100 % (API,  │
   │                         │ worker); standard (game server, web)    │
   │                         └────────────────────────────────────────┘
   │  changes in infra/** ─────────────► Cloud Build: infra-plan (PR) / infra-apply (main, prod needs approval)
   └  nightly schedule ────────────────► Cloud Build: nightly.yaml (long fuzzing, load test vs staging)
```

---

## 2. GCP Projects & Identity

| Project | Contains |
|---|---|
| `bomberman-cicd` | Cloud Build triggers & the GitHub connection, **Artifact Registry** (`europe-west3-docker.pkg.dev/bomberman-cicd/images`), **Cloud Deploy** pipelines, Terraform state bucket, build artifacts bucket |
| `bomberman-staging` | The staging environment (Cloud Run, Cloud SQL, Pub/Sub, …) |
| `bomberman-prod` | The production environment |

All projects are in EU locations. The org policy `gcp.resourceLocations = in:eu-locations` applies (spec §8.1).

**Service accounts** (least privilege, one per job):

| Service account | Used by | Permissions |
|---|---|---|
| `cb-ci@cicd` | PR builds | Read source, write logs. **No** registry push, **no** secrets, no deploy. |
| `cb-release@cicd` | Builds on main | Push to Artifact Registry, write the artifacts bucket, create Cloud Deploy releases |
| `deploy-staging@staging` | Cloud Deploy execution (staging) | Deploy Cloud Run, run the migration job, write the web bucket, invalidate the CDN |
| `deploy-prod@prod` | Cloud Deploy execution (prod) | Same, in prod |
| `tf-plan@cicd` | Infra PR plans | Viewer on all projects, read access to the state bucket |
| `tf-apply@cicd` | Infra apply | Admin roles on staging/prod, used **only** by the infra-apply trigger |

- **Prod promotion** requires the `roles/clouddeploy.approver` role, granted only to named maintainers.
- **No long-lived keys** exist anywhere. Runtime secrets (JWT signing key, etc.) live in **Secret Manager** and are mounted into Cloud Run. Builds never see them.

---

## 3. Repository Layout for CI/CD

```
/cloudbuild/
  ci.yaml              PR checks
  release.yaml         main: test, build, push, create releases
  infra-plan.yaml      terraform plan (PR, per env)
  infra-apply.yaml     terraform apply (main; prod trigger requires approval)
  nightly.yaml         long fuzzing, load test with cmd/bots, dependency audit
/deploy/
  clouddeploy.yaml     delivery pipelines + targets
  skaffold.yaml        profiles: staging / prod, one config per deployable
  run/                 Cloud Run service manifests (api, gameserver, worker) + migrate job
  web-target/          custom-target container: rsync bundle → GCS, invalidate Cloud CDN
/server/Dockerfile     multi-stage; targets: api, gameserver, worker, migrate (distroless/static, non-root)
/infra/
  modules/             network, cloudsql, pubsub, run-service, cdn, monitoring, …
  envs/cicd|staging|prod
```

---

## 4. Pipelines

### 4.1 CI: pull requests (`ci.yaml`)

| Setting | Value |
|---|---|
| Trigger | Pull request to `main` |
| Build config | `cloudbuild/ci.yaml` |
| PRs from forks | Run only after a maintainer comments `/gcbrun` (comment control), so outside code never runs with project credentials |
| Status | Reported back to GitHub as a **required status check** |

| Step (runs in parallel where possible) | Tooling |
|---|---|
| Go lint & vet | `golangci-lint run`, `go vet` |
| Go unit tests | `go test -race ./...` (simulation, rating, match logic, codec) |
| Go integration tests | `docker compose` with **Postgres 17 + Pub/Sub emulator** on the `cloudbuild` network, then `go test -tags=integration` (inbox idempotency, migrations up/down) |
| Short fuzzing | `go test -fuzz=. -fuzztime=30s` on the protocol decoder |
| Web | `npm ci`, `eslint`, `vue-tsc`, `vitest --run`, `vite build` |
| Protocol contract | Go & TS golden-vector tests for the codec. **Rule vectors:** a Go test reruns `cmd/vectorgen` and fails if `/protocol/testdata/rules` is stale, then Vitest replays them through the TS prediction subset. `buf lint` + `buf breaking` against `main` for the event schemas. |
| Container build check | `docker build` of all targets (no push) |

**Target duration:** under 10 min on `E2_HIGHCPU_8`. Go modules and npm are cached in a GCS cache bucket.

```yaml
# cloudbuild/ci.yaml (abridged)
steps:
  - id: go-lint
    name: golangci/golangci-lint:v2.5.0        # pin versions
    dir: server
    args: ['golangci-lint', 'run', './...']
    waitFor: ['-']
  - id: go-test
    name: golang:1.25
    dir: server
    args: ['go', 'test', '-race', '-count=1', './...']
    waitFor: ['-']
  - id: integration-deps
    name: gcr.io/cloud-builders/docker
    args: ['compose', '-f', 'server/test/compose.yaml', 'up', '-d', '--wait']   # services join the 'cloudbuild' network
    waitFor: ['-']
  - id: go-integration
    name: golang:1.25
    dir: server
    env:
      - 'DATABASE_URL=postgres://test:test@postgres:5432/test?sslmode=disable'
      - 'PUBSUB_EMULATOR_HOST=pubsub:8085'
    args: ['go', 'test', '-tags=integration', '-count=1', './...']
    waitFor: ['integration-deps']
  - id: web
    name: node:22
    dir: web
    entrypoint: bash
    args: ['-c', 'npm ci && npm run lint && npm run typecheck && npm run test -- --run && npm run build']
    waitFor: ['-']
  - id: buf-breaking
    name: bufbuild/buf
    args: ['breaking', 'protocol/events', '--against', '.git#branch=main,subdir=protocol/events']
    waitFor: ['-']
options:
  machineType: E2_HIGHCPU_8
  logging: CLOUD_LOGGING_ONLY
timeout: 1200s
```

### 4.2 Release: merge to `main` (`release.yaml`)

1. Re-run the fast tests (unit, lint) as a safety net.
2. Build the images `api`, `gameserver`, `worker` and `migrate`, tagged `$SHORT_SHA`, and push them to Artifact Registry. Cloud Build generates **SLSA build provenance**, and **Artifact Analysis** scans for vulnerabilities on push.
3. Build the web bundle with hashed asset names and upload it to `gs://bomberman-cicd-artifacts/web/$SHORT_SHA/`.
4. Create **one Cloud Deploy release per deployable**, named `rel-$SHORT_SHA`. The release goes to staging automatically.

```bash
gcloud deploy releases create rel-$SHORT_SHA \
  --project=bomberman-cicd --region=europe-west3 \
  --delivery-pipeline=api \
  --images=api=europe-west3-docker.pkg.dev/bomberman-cicd/images/api:$SHORT_SHA,migrate=europe-west3-docker.pkg.dev/bomberman-cicd/images/migrate:$SHORT_SHA
```

### 4.3 Delivery: Cloud Deploy

There is one delivery pipeline per deployable. They differ in strategy:

| Pipeline | Runtime | Staging | Prod strategy | Why |
|---|---|---|---|---|
| `api` | Cloud Run service | auto | **Canary 10 % → 50 % → 100 %**, with verification at each step | Stateless, so traffic splitting is safe |
| `worker` | Cloud Run (Pub/Sub push) | auto | **Canary** | Stateless. Idempotent consumers make mixed versions safe. |
| `gameserver` | Cloud Run (v1) / GKE (v2) | auto | **Standard** (all at once), approval required, **deploy window** | Arenas live in memory, and a canary would split players between instances. In v1 a deploy can interrupt running matches (see §6). |
| `web` | GCS + Cloud CDN (Cloud Deploy **custom target**) | auto | Standard | `index.html` uses `no-cache` and assets are hashed, so the switch is instant and atomic |

**Hooks and checks:**

| When | What runs |
|---|---|
| **Predeploy** (every pipeline) | Database migrations. The hook runs `gcloud run jobs deploy migrate … && gcloud run jobs execute migrate --wait`. The migrate job reaches Cloud SQL over its private IP through Direct VPC egress. `golang-migrate` takes a lock and does nothing if the schema is already current, so whichever pipeline deploys first runs the migration and the others skip it. |
| **Verify** (staging) | A verification container runs: (1) the Playwright smoke test (guest → quick play → 2-client round); (2) a `cmd/bots` ranked best-of-3 with 2 registered bot accounts, asserting that the ratings changed through the Pub/Sub → worker → DB path within 10 s; (3) health and metrics checks. |
| **Approval** | The prod target has `requireApproval: true`. Approvers are notified, and an approved rollout runs automatically. |

```yaml
# deploy/clouddeploy.yaml (abridged, api pipeline)
apiVersion: deploy.cloud.google.com/v1
kind: DeliveryPipeline
metadata:
  name: api
serialPipeline:
  stages:
    - targetId: staging
      profiles: [staging]
      strategy:
        standard:
          predeploy: { actions: [migrate] }
          verify: true
    - targetId: prod
      profiles: [prod]
      strategy:
        canary:
          runtimeConfig:
            cloudRun: { automaticTrafficControl: true }
          canaryDeployment:
            percentages: [10, 50]
            verify: true
---
apiVersion: deploy.cloud.google.com/v1
kind: Target
metadata: { name: staging }
run: { location: projects/bomberman-staging/locations/europe-west3 }
executionConfigs:
  - usages: [RENDER, DEPLOY, VERIFY, PREDEPLOY]
    serviceAccount: deploy-staging@bomberman-staging.iam.gserviceaccount.com
---
apiVersion: deploy.cloud.google.com/v1
kind: Target
metadata: { name: prod }
requireApproval: true
run: { location: projects/bomberman-prod/locations/europe-west3 }
executionConfigs:
  - usages: [RENDER, DEPLOY, VERIFY, PREDEPLOY]
    serviceAccount: deploy-prod@bomberman-prod.iam.gserviceaccount.com
```

*The prod migration runs as the predeploy hook of the first rollout to reach prod. Exact field names should be checked against the Cloud Deploy reference when this is implemented.*

### 4.4 Infrastructure: Terraform (`infra-plan.yaml`, `infra-apply.yaml`)

| Event | Action |
|---|---|
| PR touching `infra/**` | `terraform fmt -check`, `validate`, `tflint`, `plan` for staging and prod. The plan output is posted as a build summary or PR comment. |
| Merge to `main` | `apply` to **staging** automatically. **Prod** apply runs on a separate trigger with **Cloud Build approval required**. |
| State | GCS bucket `bomberman-tfstate` (EU, versioning on, uniform access), one prefix per environment |

GCP's managed Terraform service, **Infrastructure Manager**, is an alternative. Plain Terraform in Cloud Build is chosen here because it is more transparent and portable.

### 4.5 Nightly (`nightly.yaml`, scheduled trigger)

- Long fuzzing: 10 min per target.
- **Load test:** `cmd/bots` runs 800 bot players against staging. It reports tick p99, RTT and allocations, and fails if they exceed the NFR thresholds.
- `govulncheck`, `npm audit`, and a check that the base images are up to date.
- Weekly: a **restore test** of a Cloud SQL backup into a scratch instance.

---

## 5. Database Migrations Policy

- Migrations are forward-only, with an **expand → migrate → contract** sequence:
  1. Add the new column or table (nullable or defaulted).
  2. Deploy code that writes both the old and new shape and reads the new one.
  3. Drop the old shape in a later release.
- As a result, **the previous release always works with the new schema**, so a rollback never needs a down-migration.
- CI runs every migration `up` on an empty DB **and** on a snapshot of the current staging schema. `down` scripts are kept only for local development.

---

## 6. Game Server Deploys (v1 caveat)

- In v1 the game server is a single Cloud Run instance with arenas in memory. Replacing the revision ends in-progress matches, which are then unrated (spec §5.4.2).
- **Mitigations:**
  - Prod rollouts of `gameserver` are approved and run in a **deploy window**, during low-traffic hours.
  - 2 minutes before the switch, the server broadcasts `server.draining` ("maintenance in 2 min"). It stops starting new matches, and best-of-3 matches already running get to finish where possible.
  - Clients reconnect and resume to the new revision automatically.
- **v2 (GKE):** pods drain gracefully (Server & Network §7). Running matches finish on old pods while new arenas go to new pods, so deploys need no window.

---

## 7. Rollback, Notifications, Observability

| Area | How |
|---|---|
| Rollback | `gcloud deploy targets rollback prod --delivery-pipeline=<name>` re-deploys the previous release. A Cloud Run canary is rolled back automatically if verification fails. |
| Notifications | Cloud Build and Cloud Deploy publish to Pub/Sub (`cloud-builds`, `clouddeploy-operations`). A **Cloud Build notifier** forwards failures and approval requests to Slack or email. |
| Deploy markers | Each prod rollout writes a log entry, which can be used as an annotation on the Cloud Monitoring dashboards (tick p99, RTT, error rate). |
| DORA metrics | Deployment frequency, lead time and failure rate, read from Cloud Deploy history. |

---

## 8. Bootstrap Steps (one-time)

1. **Host the repository** on GitHub (private). Cloud Source Repositories is no longer available to new customers.
2. Create the projects `bomberman-cicd`, `-staging` and `-prod`, link billing, and set the org policy for EU locations.
3. Run Terraform **locally once** for `envs/cicd`. This enables the APIs and creates Artifact Registry, the state and artifact buckets, the service accounts and the Cloud Deploy pipelines.
4. **Connect GitHub** to Cloud Build using a 2nd-gen repository connection. This means installing the Cloud Build GitHub App, a one-time step in the console. Then create the triggers (also in Terraform).
5. Push to `main`. The infra-apply trigger creates staging, and the first release deploys to staging.
6. Grant prod approvers `roles/clouddeploy.approver`, approve the prod infra apply, then promote the first release.
7. In GitHub branch protection, require the `ci` status check and at least 1 review on `main`.

**Cost:**

- Cloud Build includes a monthly free tier of build-minutes on the default pool. CI at this scale should stay close to it.
- Cloud Deploy charges per active delivery pipeline per month, which is a few dollars for 4 pipelines.
- Artifact Registry storage is negligible with a cleanup policy that keeps the last 30 images per repo.
- Check the current GCP pricing pages before relying on these numbers.

**Alternative:** **GitHub Actions** with **Workload Identity Federation** (no keys) for CI, while still deploying through Cloud Deploy, is equally valid. Choose it if the team prefers PR checks inside GitHub. The Cloud Deploy part stays the same.

---

## 9. Open Questions

1. **Git hosting:** GitHub (assumed), GitLab or Bitbucket? All three work with Cloud Build triggers.
2. **Prod approvers:** who may approve prod promotions and infra applies?
3. **Notifications:** Slack channel, email, or both?
4. **Game server deploy window (v1):** which time of day? For example 05:00–06:00 CET.
