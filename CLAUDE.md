# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

BomberMan Online is a browser-based, real-time multiplayer Bomberman game: 2–4 players per arena, a 21×21 grid, best-of-3 matches, AI aliens, and Ranked (ELO) and Unrated modes. **The repo currently contains only design docs** (`docs/`); no code has been written yet. The docs are the source of truth. Read the relevant one before implementing a feature, and update it when a design decision changes.

| Doc | Covers |
|---|---|
| `docs/SPECIFICATION.md` | Game rules, accounts, ranking/ELO, REST API, PostgreSQL schema, milestones (M1–M8) |
| `docs/SERVER-AND-NETWORK.md` | Go monorepo layout, simulation package, arena actor, binary protocol, prediction/interpolation |
| `docs/EVENTS-AND-MESSAGING.md` | Three event classes, Pub/Sub, outbox/inbox, rating worker |
| `docs/BACKEND-ARCHITECTURE.md` | Go service layering (transport → service → domain), pgx + sqlc (no ORM), worked example |
| `docs/GUI-PLAN.md` | Vue app structure, stores, canvas renderer, client event handling |
| `docs/CI-CD.md` | Cloud Build pipelines, Cloud Deploy, Terraform, migration policy, branching model, public-repo safeguards |

## Git workflow (mandatory)

- **Allowed:** create `feature/<topic>` or `bugfix/<topic>` branches from `dev`, commit to them, push them, and open pull requests with `gh pr create --base dev`.
- **Never** merge, approve, close or otherwise complete a pull request (no `gh pr merge`, no `gh pr review --approve`, no `gh pr close`). The repo owner reviews every diff and finishes PRs themselves.
- **Never** commit or push directly to `dev` or `main`, and never force-push them.
- Merge policy, which the owner carries out:
  - feature/bug PRs → `dev` are **squash merged**, so keep the branch rebased on `dev`.
  - `dev` → `main` is **fast-forward only**.
- The repository is **public**. Never commit secrets, `.env` files, keys or sensitive `*.tfvars`.

The build order follows the milestones in `SPECIFICATION.md` §12, starting with M1, the core simulation in `server/internal/game`.

## Stack and planned layout

- `server/`: one Go 1.25+ module that builds one container image. Binaries live in `cmd/`: `api` (REST, chi), `gameserver`, `worker` (rating), `bots`, `vectorgen`. Uses pgx with golang-migrate, and `coder/websocket`.
- `web/`: Vue 3, TypeScript (strict), Vite, Pinia, Tailwind, Canvas 2D. Tested with Vitest and Playwright.
- `protocol/`: golden binary codec vectors, generated rule vectors (`testdata/rules/`), and the Protobuf schemas for domain events (`events/`).
- `infra/` (Terraform), `cloudbuild/`, `deploy/` (Cloud Deploy + Skaffold).
- PostgreSQL 17, GCP, **EU regions only**.

## Commands (planned, from `docs/CI-CD.md`)

```
# server/
golangci-lint run ./...
go test -race -count=1 ./...
go test -race -run TestName ./internal/game      # single test
go test -tags=integration -count=1 ./...          # needs server/test/compose.yaml (Postgres 17 + Pub/Sub emulator), DATABASE_URL, PUBSUB_EMULATOR_HOST
go test -fuzz=. -fuzztime=30s ./internal/proto    # protocol decoder fuzzing
go run ./cmd/vectorgen                            # regenerate /protocol/testdata/rules after any rule change

# web/
npm run lint; npm run typecheck; npm run test -- --run; npm run build
npx vitest run path/to/file.test.ts               # single test

# protocol/
buf lint; buf breaking protocol/events --against '.git#branch=main,subdir=protocol/events'
```

## Architecture rules that span multiple files

**Simulation (`internal/game`) is pure and deterministic:** `State + []Command → State' + []Event`.
- It must not use `time.Now()`, goroutines, I/O, global randomness or floats. All math is integer, and each match has one PCG PRNG seeded from the match seed.
- The update order inside a tick is fixed (see SERVER-AND-NETWORK §3.2). Don't reorder it.
- Entities live in preallocated fixed-size arrays, so steady-state ticks make **0 allocations**. `testing.AllocsPerRun` benchmarks enforce this.
- `internal/game` simulates one round. Best-of-N logic lives in `internal/game/match`, and the arena actor (`internal/arena`) drives ROUND → ROUND_END → MATCH_END.

**Rules are duplicated in Go and TypeScript, and test vectors keep them in sync.** The client predicts only its own movement and bomb placement (`canEnter`, `stepMovement`, `canPlaceBomb`), in roughly 300 lines in `web/src/game/sim/`. Never add predicted rules beyond that subset. If you change the Go movement or bomb-placement rules, rerun `cmd/vectorgen` and commit the updated vectors. CI fails if the vectors are stale, and Vitest replays them tick for tick. The binary codec works the same way, with golden vectors in `/protocol`.

**Arena actor:** one goroutine per arena owns all of its state, so it needs no locks.
- It ticks at 60 Hz on an absolute schedule and sends snapshots at 30 Hz.
- Inputs arrive through SPSC ring buffers, and output goes through a non-blocking coalescing outbox.
- The tick path must never block, do I/O or touch the DB.

**The game server never writes to PostgreSQL.** When a match ends it publishes `match.finished` to Pub/Sub, falling back to a bounded local spool. The rating worker persists the match and applies ELO idempotently through an inbox table, then fires `LISTEN/NOTIFY rating_updated` inside the same transaction.

**Event classes** (EVENTS-AND-MESSAGING §2). Rule of thumb: if losing an event changes someone's data, it is class C. Otherwise it is A or B.

| Class | What | Mechanism |
|---|---|---|
| A | In-game events | Go straight over the socket with arena-scoped `eventSeq`, a 10 s replay ring and resync on gaps. Never use a queue. |
| B | Ephemeral notifications | In-process hub (v1). |
| C | Durable domain events | Pub/Sub with CloudEvents envelopes. Event names are versioned (`match.finished.v1`), and their Protobuf schemas are checked by `buf breaking`. |

**Vue client:**
- Vue renders menus and the HUD only. `GameClient` is a plain TypeScript engine wrapped in `markRaw` and drawn onto a canvas.
- Per-frame data must never go into reactive state. HUD values reach Pinia through `hudBridge`, which pushes only changes and throttles them to ≤ 10 Hz.
- `world.ts` is mutated **only** by `applyEvent` and `applySnapshot` (through `EventDispatcher`). Subscribers are read-only.

**DB migrations** are forward-only and follow expand → migrate → contract. The previous release must keep working against the new schema, so rollbacks never need a down-migration.

**v1 vs. v2:** v1 runs a single Cloud Run game server over WebSocket. v2 adds multi-region GKE, a gateway, Redis and WebTransport. Keep the transport behind an interface so it can be swapped.
