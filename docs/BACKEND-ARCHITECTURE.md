# BomberMan Online: Go Backend Architecture (layers, domain, database)

| | |
|---|---|
| **Version** | 0.2 (draft) |
| **Date** | 2026-11-11 |
| **Parent** | [SPECIFICATION.md](./SPECIFICATION.md) · [SERVER-AND-NETWORK.md §3.1](./SERVER-AND-NETWORK.md#31-repository-layout-monorepo) |

**Changes in 0.2:**

- Transport is **Gin** (HTTP: auth with cookies, health) plus **gRPC** services generated with **buf** (all data APIs, reached from the browser through Envoy as gRPC-Web). chi is gone (§2, §4.7, §4.9).
- Migrations use **Goose** (§3).
- Tests use **testify** and **mockery**-generated mocks (§5).
- The registration slice matches the schema in DATABASE.md: the password hash lives in `user_credentials`, and registration also creates `user_stats` (§4).

This document explains how the Go services (`cmd/api`, `cmd/worker`, and the persistence side of `cmd/gameserver`) are layered: transport, application services, domain model and database access. It ends with a complete vertical slice (user registration), a gRPC read endpoint, and a list of learning resources.

---

## 1. How Go does layers (coming from Java/C#/Node)

Go has no dominant framework (there is no Spring, ASP.NET or NestJS), and the community mostly avoids big ones. The same ideas still apply, built from plain packages. Gin and gRPC are used only at the edge, as transport.

| Idea | Typical Go form |
|---|---|
| Layer / module | A **package** (a directory). Package boundaries are the architecture. |
| Dependency direction | **Imports point inward**: transport → service → domain. The domain imports nothing from the project except other domain packages. Go forbids import cycles, which enforces this. |
| Interfaces | **Defined by the consumer**, small, often one or two methods. "Accept interfaces, return structs." The service declares the `Repository` interface it needs, and the store package implements it without importing the service. |
| Dependency injection | **Constructor functions** (`NewService(repo, clock)`) wired by hand in `main`. No DI container. |
| ORM | Usually **none**. SQL is written by hand and type-safe Go is generated from it (sqlc). See §3. |
| Exceptions | Returned `error` values. Domain packages define sentinel errors (`ErrUsernameTaken`) that the transport layer maps to HTTP status codes (Gin) or gRPC status codes (gRPC). |
| Packaging | **By feature** (`account`, `rating`, `leaderboard`), not by kind (`models`, `controllers`, `services`). |

## 2. The layers in this project

```
                ┌──────────────────────────────────────────────────┐
 HTTP / gRPC /  │ Transport   internal/api (Gin), internal/grpcapi │  decode, validate, auth, map errors →
 WS          →  │             (gRPC), internal/transport/ws        │  HTTP status / gRPC code
                └───────────────────────┬──────────────────────────┘
                                        ▼
                ┌──────────────────────────────────────────────────┐
                │ Application  internal/account, internal/         │  use cases: transactions, orchestration,
                │ services     matchresult, internal/leaderboard   │  defines the Repository interfaces it needs
                └───────────────────────┬──────────────────────────┘
                                        ▼
                ┌──────────────────────────────────────────────────┐
                │ Domain       internal/rating, internal/game,     │  pure Go: types + rules, no I/O, no SQL,
                │              internal/game/match, account        │  100 % unit-testable
                │              types (User, Username, Email)       │
                └──────────────────────────────────────────────────┘
                                        ▲ implements interfaces
                ┌───────────────────────┴──────────────────────────┐
                │ Infrastructure internal/store (pgx + sqlc),      │  SQL, transactions, mapping rows ↔ domain,
                │                internal/events (Pub/Sub)         │  pg error codes → domain errors
                └──────────────────────────────────────────────────┘
```

**Rules:**

1. `internal/game`, `internal/game/match` and `internal/rating` are **pure domain**. They never import `store`, `pgx`, `net/http`, Gin, gRPC or `time.Now()`. This is already required for deterministic replays.
2. Services hold the use-case logic and own **transaction boundaries**. A service method is one use case (`Register`, `RecordMatch`).
3. The store maps between generated sqlc row structs and domain types. **sqlc structs never leave `internal/store`** on the write path.
4. **Generated protobuf types never go below the transport layer.** `internal/grpcapi` converts between `bombermanv1.*` messages and domain/DTO types, just as the store does for sqlc rows. Services don't import `internal/gen`.
5. **Read-only queries may skip the domain** (light CQRS). For example, the leaderboard RPC calls a `leaderboard.Reader` that returns DTO rows straight from SQL. There are no rules to protect there, so mapping through domain objects would add nothing.
6. Handlers and RPC methods contain no business logic. They decode, call one service method, and encode.

### 2.1 Which transport for what

| Transport | Package | Used for | Why |
|---|---|---|---|
| **Gin** (HTTP/JSON) | `internal/api` | `/api/auth/*`, `/ping`, `/healthz`, `/readyz`, `/metrics` | The refresh token is an `HttpOnly` cookie, which needs plain HTTP. Health checks and probes are plain HTTP everywhere. |
| **gRPC** (protobuf, buf) | `internal/grpcapi` | `AccountService`, `RegionService`, `LeaderboardService`, `ProfileService` (spec §6.1) | Typed contract shared with the Vue client through generated code, breaking-change checks with `buf breaking`, and the same API can be called by internal tools and bots. |
| **WebSocket** (binary + JSON) | `internal/transport/ws` | The game (Server & Network §4–§5) | 60 Hz, tiny frames, custom binary codec |

The API process listens on two ports: Gin on `:8080` and gRPC on `:9090`. Envoy translates the browser's gRPC-Web calls into gRPC for `:9090` (CI-CD §6.1).

### 2.2 Package additions to the layout

The layout in [Server & Network §3.1](./SERVER-AND-NETWORK.md#31-repository-layout-monorepo) gains these packages:

```
internal/account        User, Username, Email (domain types + validation), Service: Register, Login, Refresh
internal/leaderboard    Reader interface + read DTOs (leaderboard, profile, match history, rating history)
internal/matchresult    Service.RecordMatch: the worker's use case (inbox → persist → ratings → notify), uses internal/rating
internal/api            Gin router, auth handlers, middleware (request ID, logging, OTel, Sentry recovery)
internal/grpcapi        gRPC server, one file per service, interceptors (auth, logging, OTel, panic recovery)
internal/store          pgxpool setup, TxManager, repository implementations, Goose runner
  queries/*.sql         SQL with sqlc annotations (source of truth for queries)
  db/                   sqlc-generated code (never edited by hand)
  migrations/*.sql      Goose files (expand/contract, see CI-CD.md §5)
internal/gen            buf-generated protobuf + gRPC code (never edited by hand)
sqlc.yaml
.mockery.yaml           which interfaces get generated mocks (§5)
```

## 3. Database access: why no ORM

| Option | What it is | Fit for us |
|---|---|---|
| `database/sql` | Standard library, driver-agnostic | Works, but verbose, and loses pgx features. Used only where a library requires it (Goose). |
| **`pgx/v5` (native)** | Fast PostgreSQL driver + `pgxpool` | **Used** as the driver: JSONB, `LISTEN/NOTIFY`, COPY, batches |
| **`sqlc`** | Generates type-safe Go from `.sql` files at build time | **Used** for all queries. SQL errors and type mismatches fail at `sqlc generate` (in CI), not at runtime. No reflection. |
| `sqlx` / `scany` | Thin helpers that scan rows into structs | Fine, but queries are only checked at runtime |
| GORM / ent / Bun | Full ORMs / query builders | Rejected. Our schema relies on Postgres features ORMs handle poorly: `FOR UPDATE` in sorted lock order, partial indexes, JSONB, `pg_notify`, an outbox and inbox tables. ORMs also hide the queries that run in the hot path of the rating worker. |

**Migrations:** **Goose**, plain `.sql` files with `-- +goose Up` / `-- +goose Down` sections ([DATABASE §8](./DATABASE.md#8-migration-plan)). The files are embedded into the binary with `//go:embed`, and `cmd/migrate` applies them with Goose's Go library:

```go
//go:embed migrations/*.sql
var migrationsFS embed.FS

func Migrate(ctx context.Context, databaseURL string) error {
    db, err := sql.Open("pgx", databaseURL) // database/sql on top of pgx: import _ "github.com/jackc/pgx/v5/stdlib"
    if err != nil {
        return fmt.Errorf("open db: %w", err)
    }
    defer db.Close()

    files, err := fs.Sub(migrationsFS, "migrations") // Goose wants the directory itself as the FS root
    if err != nil {
        return err
    }
    locker, err := lock.NewPostgresSessionLocker() // advisory lock, so two runs can't overlap
    if err != nil {
        return err
    }
    provider, err := goose.NewProvider(goose.DialectPostgres, db, files, goose.WithSessionLocker(locker))
    if err != nil {
        return fmt.Errorf("goose provider: %w", err)
    }
    _, err = provider.Up(ctx)            // no-op when the schema is already current
    return err
}
```

sqlc reads the same migration files as its schema (it understands the Goose annotations and ignores the down sections), so generated code always matches the real schema.

## 4. Vertical slice: user registration

Use case: `POST /api/auth/register` (Gin) creates a user, their credentials, their `player_ratings` row (1200) and their `user_stats` row **in one transaction**.

### 4.1 Migration

The schema is in [DATABASE.md §3](./DATABASE.md#3-tables) and the files are listed in [DATABASE §8](./DATABASE.md#8-migration-plan). Registration touches `users`, `user_credentials`, `player_ratings` and `user_stats` (`00002_accounts.sql`, `00003_ratings_and_stats.sql`).

### 4.2 Queries (`internal/store/queries/users.sql`)

```sql
-- name: CreateUser :one
INSERT INTO users (id, username, email)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CreateUserCredentials :exec
INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2);

-- name: CreatePlayerRating :exec
INSERT INTO player_ratings (user_id) VALUES ($1);

-- name: CreateUserStats :exec
INSERT INTO user_stats (user_id) VALUES ($1);

-- name: GetCredentialsByUsername :one
SELECT u.id, u.username, u.email, u.created_at, c.password_hash
FROM users u
JOIN user_credentials c ON c.user_id = u.id
WHERE u.username = $1;
```

The password hash is only ever read by `GetCredentialsByUsername`, for login. Profile queries select from `users` and never see it.

### 4.3 sqlc config (`server/sqlc.yaml`)

```yaml
version: "2"
sql:
  - engine: postgresql
    schema: internal/store/migrations
    queries: internal/store/queries
    gen:
      go:
        package: db
        out: internal/store/db
        sql_package: pgx/v5
        emit_pointers_for_null_types: true
        overrides:
          - db_type: uuid
            go_type: github.com/google/uuid.UUID
          - db_type: citext
            go_type: string
```

DATABASE §4.3 lists the extra overrides for `timestamptz` and nullable UUIDs. `sqlc generate` then produces, among others:

```go
func (q *Queries) CreateUser(ctx context.Context, arg CreateUserParams) (User, error)
func (q *Queries) CreateUserCredentials(ctx context.Context, arg CreateUserCredentialsParams) error
func (q *Queries) CreatePlayerRating(ctx context.Context, userID uuid.UUID) error
func (q *Queries) CreateUserStats(ctx context.Context, userID uuid.UUID) error
func (q *Queries) WithTx(tx pgx.Tx) *Queries
```

### 4.4 Domain (`internal/account/user.go`)

```go
package account

var (
    ErrUsernameTaken   = errors.New("username taken")
    ErrEmailTaken      = errors.New("email taken")
    ErrInvalidUsername = errors.New("invalid username")
    ErrInvalidEmail    = errors.New("invalid email")
)

type User struct {
    ID        uuid.UUID
    Username  Username
    Email     Email
    CreatedAt time.Time
}

// Username is validated once, at construction; a Username value is always valid.
type Username string

var usernameRe = regexp.MustCompile(`^[A-Za-z0-9_]{3,16}$`)

func NewUsername(s string) (Username, error) {
    if !usernameRe.MatchString(s) {
        return "", ErrInvalidUsername
    }
    return Username(s), nil
}

// Email follows the same pattern: NewEmail checks the format and the 254-character limit.
type Email string
```

### 4.5 Service (`internal/account/service.go`)

```go
package account

// Repository is declared here, by the consumer. internal/store implements it.
type Repository interface {
    // CreateWithRating inserts the user, credentials, initial rating and stats atomically.
    CreateWithRating(ctx context.Context, u User, passwordHash string) (User, error)
    // CredentialsByUsername returns the user and the password hash, for login only.
    CredentialsByUsername(ctx context.Context, name Username) (User, string, error)
}

type Hasher interface {
    Hash(password string) (string, error)
    Verify(hash, password string) bool
}

type Service struct {
    repo   Repository
    hasher Hasher
    now    func() time.Time
}

func NewService(repo Repository, hasher Hasher, now func() time.Time) *Service {
    return &Service{repo: repo, hasher: hasher, now: now}
}

func (s *Service) Register(ctx context.Context, username, email, password string) (User, error) {
    name, err := NewUsername(username)
    if err != nil {
        return User{}, err
    }
    mail, err := NewEmail(email)
    if err != nil {
        return User{}, err
    }
    hash, err := s.hasher.Hash(password) // argon2id
    if err != nil {
        return User{}, fmt.Errorf("hash password: %w", err)
    }
    id, err := uuid.NewV7() // time-ordered IDs, see DATABASE.md §1.2
    if err != nil {
        return User{}, fmt.Errorf("new id: %w", err)
    }
    return s.repo.CreateWithRating(ctx, User{ID: id, Username: name, Email: mail}, hash)
}
```

### 4.6 Store (`internal/store/users.go`)

```go
package store

type Store struct {
    pool *pgxpool.Pool
    q    *db.Queries
}

// inTx runs fn in one transaction and rolls back on error or panic.
func (s *Store) inTx(ctx context.Context, fn func(q *db.Queries) error) error {
    return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
        return fn(s.q.WithTx(tx))
    })
}

func (s *Store) CreateWithRating(ctx context.Context, u account.User, hash string) (account.User, error) {
    var out account.User
    err := s.inTx(ctx, func(q *db.Queries) error {
        row, err := q.CreateUser(ctx, db.CreateUserParams{
            ID: u.ID, Username: string(u.Username), Email: string(u.Email),
        })
        if err != nil {
            return mapUniqueViolation(err)
        }
        if err := q.CreateUserCredentials(ctx, db.CreateUserCredentialsParams{
            UserID: row.ID, PasswordHash: hash,
        }); err != nil {
            return err
        }
        if err := q.CreatePlayerRating(ctx, row.ID); err != nil {
            return err
        }
        if err := q.CreateUserStats(ctx, row.ID); err != nil {
            return err
        }
        out = account.User{ID: row.ID, Username: account.Username(row.Username),
            Email: account.Email(row.Email), CreatedAt: row.CreatedAt}
        return nil
    })
    return out, err
}

// mapUniqueViolation turns Postgres error 23505 into domain errors.
func mapUniqueViolation(err error) error {
    var pgErr *pgconn.PgError
    if errors.As(err, &pgErr) && pgErr.Code == "23505" {
        switch pgErr.ConstraintName {
        case "users_username_key":
            return account.ErrUsernameTaken
        case "users_email_key":
            return account.ErrEmailTaken
        }
    }
    return err
}
```

### 4.7 Handler (`internal/api/auth.go`, Gin)

```go
type registerRequest struct {
    Username string `json:"username" binding:"required"`
    Email    string `json:"email"    binding:"required"`
    Password string `json:"password" binding:"required,min=8"`
}

func (h *Handlers) register(c *gin.Context) {
    var req registerRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, errorBody("bad_request", err))
        return
    }
    user, err := h.accounts.Register(c.Request.Context(), req.Username, req.Email, req.Password)
    switch {
    case errors.Is(err, account.ErrUsernameTaken), errors.Is(err, account.ErrEmailTaken):
        c.JSON(http.StatusConflict, errorBody("taken", err))
    case errors.Is(err, account.ErrInvalidUsername), errors.Is(err, account.ErrInvalidEmail):
        c.JSON(http.StatusUnprocessableEntity, errorBody("invalid_input", err))
    case err != nil:
        _ = c.Error(err) // logged and sent to Sentry by middleware, not exposed
        c.JSON(http.StatusInternalServerError, errorBody("internal", nil))
    default:
        h.issueTokens(c, user) // access JWT in the body + refresh token as HttpOnly cookie
    }
}

func routes(r *gin.Engine, h *Handlers) {
    auth := r.Group("/api/auth")
    auth.POST("/register", h.register)
    auth.POST("/login", h.login)
    auth.POST("/guest", h.guest)
    auth.POST("/refresh", h.refresh)
    auth.POST("/logout", h.requireUser(), h.logout)
    r.HEAD("/ping", func(c *gin.Context) { c.Status(http.StatusNoContent) })
    r.GET("/healthz", h.healthz)
    r.GET("/readyz", h.readyz)
}
```

Gin runs in release mode (`gin.SetMode(gin.ReleaseMode)`) with `gin.New()` plus our own middleware, not `gin.Default()`, so logging goes through `slog` (JSON) and panics are reported to Sentry.

### 4.8 Wiring (`cmd/api/main.go`)

```go
func main() {
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()
    if err := run(ctx, os.Getenv, os.Stdout); err != nil {
        fmt.Fprintln(os.Stderr, err)
        os.Exit(1)
    }
}

func run(ctx context.Context, getenv func(string) string, stdout io.Writer) error {
    cfg, err := config.Load(getenv)
    if err != nil {
        return err
    }
    shutdownTelemetry, err := telemetry.Init(ctx, cfg) // OTel tracer + Prometheus exporter, Sentry
    if err != nil {
        return err
    }
    defer shutdownTelemetry(context.Background())

    pool, err := store.NewPool(ctx, cfg.DatabaseURL) // role "api", password from .env
    if err != nil {
        return err
    }
    defer pool.Close()

    log := slog.New(slog.NewJSONHandler(stdout, nil))
    st := store.New(pool)
    accounts := account.NewService(st, auth.Argon2Hasher{}, time.Now)

    httpSrv := api.NewServer(cfg, accounts, log)                    // Gin on :8080
    grpcSrv := grpcapi.NewServer(cfg, accounts, st /* leaderboard.Reader */, log) // gRPC on :9090

    g, ctx := errgroup.WithContext(ctx)
    g.Go(func() error { return httpserver.Run(ctx, cfg.HTTPAddr, httpSrv) }) // graceful shutdown on ctx.Done()
    g.Go(func() error { return grpcapi.Run(ctx, cfg.GRPCAddr, grpcSrv) })    // GracefulStop on ctx.Done()
    return g.Wait()
}
```

`run` takes its environment as arguments, so tests can start the whole service in-process. This follows Mat Ryer's pattern (see §6).

### 4.9 A gRPC read endpoint (`internal/grpcapi/leaderboard.go`)

The contract lives in `/protocol/api/bomberman/v1/leaderboard.proto`:

```protobuf
syntax = "proto3";
package bomberman.v1;

service LeaderboardService {
  rpc ListLeaderboard(ListLeaderboardRequest) returns (ListLeaderboardResponse);
}

message ListLeaderboardRequest {
  int32 offset = 1;
  int32 limit  = 2;   // 1..100
}

message LeaderboardEntry {
  int32  rank          = 1;
  string username      = 2;
  int32  rating        = 3;
  int32  rated_matches = 4;
  int32  wins          = 5;
}

message ListLeaderboardResponse {
  repeated LeaderboardEntry entries = 1;
  int32 total = 2;
}
```

`buf generate` writes the Go code to `server/internal/gen/bomberman/v1` and the TypeScript code to `web/src/gen`. The implementation is a thin adapter:

```go
type leaderboardServer struct {
    bombermanv1.UnimplementedLeaderboardServiceServer
    reader leaderboard.Reader
}

func (s *leaderboardServer) ListLeaderboard(ctx context.Context, req *bombermanv1.ListLeaderboardRequest) (*bombermanv1.ListLeaderboardResponse, error) {
    if req.GetLimit() < 1 || req.GetLimit() > 100 || req.GetOffset() < 0 {
        return nil, status.Error(codes.InvalidArgument, "limit must be 1..100, offset ≥ 0")
    }
    page, err := s.reader.Leaderboard(ctx, int(req.GetOffset()), int(req.GetLimit()))
    if err != nil {
        return nil, err // the error interceptor logs it and returns codes.Internal
    }
    resp := &bombermanv1.ListLeaderboardResponse{Total: int32(page.Total)}
    for _, e := range page.Entries {
        resp.Entries = append(resp.Entries, &bombermanv1.LeaderboardEntry{
            Rank: int32(e.Rank), Username: e.Username, Rating: int32(e.Rating),
            RatedMatches: int32(e.RatedMatches), Wins: int32(e.Wins),
        })
    }
    return resp, nil
}
```

**Interceptors** (chained in `grpcapi.NewServer`): OpenTelemetry (`otelgrpc` stats handler), request logging, panic recovery → Sentry, **auth** (reads `authorization: Bearer <jwt>` from the metadata and puts the identity in the context; methods marked public in a table skip it), and **error mapping** (domain sentinel errors → `NotFound`, `InvalidArgument`, `AlreadyExists`; anything else → `Internal` without details).

## 5. Testing per layer

Go tests use the standard `testing` package and `go test`. **testify** adds readable assertions (`require` stops the test, `assert` continues), and **mockery** generates mocks for the consumer-defined interfaces (`account.Repository`, `account.Hasher`, `leaderboard.Reader`, the Pub/Sub publisher…). The generated mocks are committed, and CI checks they are current (CI-CD §4.1).

| Layer | Test style | Tooling |
|---|---|---|
| Domain (`rating`, `game`, `match`, `account` types) | Table-driven unit tests, fuzz, benchmarks | `testing` + testify `require`/`assert` |
| Services | Unit tests with **mockery** mocks of `Repository`, `Hasher`, etc. Expectations are set per test (`repo.EXPECT().CreateWithRating(...).Return(...)`). | testify + mockery |
| Store | Integration tests against **real Postgres 17**, each test in a rolled-back transaction or a fresh schema. Never mocked: the point is to test the SQL. | `-tags=integration`, `server/test/compose.yaml` ([CI-CD §4.1](./CI-CD.md#41-ci-pull-requests-ciyml)) |
| Gin handlers | `httptest` + `gin.New()` router with a mocked service; one end-to-end test calls `run()` against the test DB | `net/http/httptest`, testify |
| gRPC services | In-process server over `bufconn` with mocked readers/services, called through the generated client | `google.golang.org/grpc/test/bufconn`, testify |

```go
func TestRegister_UsernameTaken(t *testing.T) {
    repo := mocks.NewMockRepository(t)          // generated by mockery; asserts expectations on cleanup
    hasher := mocks.NewMockHasher(t)
    hasher.EXPECT().Hash("s3cret-pass").Return("$argon2id$…", nil)
    repo.EXPECT().CreateWithRating(mock.Anything, mock.Anything, "$argon2id$…").
        Return(account.User{}, account.ErrUsernameTaken)

    svc := account.NewService(repo, hasher, time.Now)
    _, err := svc.Register(context.Background(), "andrew", "a@example.com", "s3cret-pass")

    require.ErrorIs(t, err, account.ErrUsernameTaken)
}
```

`.mockery.yaml` (server root) lists the packages and interfaces, generating into a `mocks` subpackage next to each one. Mocks are for **service** tests only. Pure domain code needs no mocks, and the store is tested against a real database.

## 6. Learning resources

| Resource | Type | Why |
|---|---|---|
| [Organizing a Go module](https://go.dev/doc/modules/layout) | Official docs | `cmd/`, `internal/`, and when to split packages |
| [How I write HTTP services in Go after 13 years](https://grafana.com/blog/how-i-write-http-services-in-go-after-13-years/) (Mat Ryer, 2024) | Article | `run()` pattern, `NewServer`, handlers, testing. §4.8 follows it. |
| [How Do You Structure Your Go Apps?](https://www.youtube.com/watch?v=oL6JBUk6tj0) (Kat Zien, GopherCon 2018) | Video | Flat vs. layered vs. modular vs. DDD/hexagonal layouts, with one example app refactored each way |
| [Achieving maintainability with hexagonal architecture](https://www.youtube.com/watch?v=vKbVrsMnhDc) (Kat Zien, dotGo 2019) | Video | Short follow-up on ports and adapters |
| [Wild Workouts](https://github.com/ThreeDotsLabs/wild-workouts-go-ddd-example) (Three Dots Labs) | Sample project + article series | A real app refactored step by step to DDD, Clean Architecture and CQRS, with **gRPC** between services. More DDD than we need; read it for the repository, gRPC and CQRS parts. |
| [WTF Dial](https://github.com/benbjohnson/wtf) (Ben Johnson) | Sample project | Small, complete app using the "domain types in the root, implementations in subpackages" layout |
| [sqlc: Getting started with PostgreSQL](https://sqlc.readthedocs.io/en/stable/tutorials/getting-started-postgresql.html) and [Using Go and pgx](https://sqlc.readthedocs.io/en/stable/guides/using-go-and-pgx.html) | Official docs | Exactly the stack in §3–§4 |
| [pgx](https://github.com/jackc/pgx) | Docs / repo | Driver, `pgxpool`, `pgx.BeginFunc`, error codes |
| [Goose](https://github.com/pressly/goose) | Docs / repo | SQL migrations, annotations, embedding, the `Provider` API |
| [Gin documentation](https://gin-gonic.com/en/docs/) | Official docs | Routing, binding and validation, middleware, testing with `httptest` |
| [gRPC Go: Basics tutorial](https://grpc.io/docs/languages/go/basics/) and [buf: Getting started](https://buf.build/docs/cli/quickstart/) | Official docs | Defining services, generating code, interceptors; `buf lint`, `buf breaking`, `buf generate` |
| [Envoy gRPC-Web filter](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/grpc_web_filter) | Official docs | The proxy config between the browser and the gRPC server |
| [testify](https://github.com/stretchr/testify) and [mockery](https://vektra.github.io/mockery/) | Docs | `require`/`assert`, generated mocks with the `EXPECT()` API |
| [OpenTelemetry Go: Getting started](https://opentelemetry.io/docs/languages/go/getting-started/) | Official docs | Tracer and meter setup, Prometheus exporter, `otelgin` / `otelgrpc` instrumentation |
| [Backend master class](https://www.youtube.com/watch?v=prh0hTyI1sU) (TECH SCHOOL) | Video series | Long free YouTube course building a bank backend with Postgres, sqlc, transactions, **Gin** and later **gRPC + gRPC gateway**. It uses golang-migrate instead of Goose, but the idea is the same. Closest to our stack as a step-by-step series. |
