# BomberMan Online: Go Backend Architecture (layers, domain, database)

| | |
|---|---|
| **Version** | 0.1 (draft) |
| **Date** | 2026-11-01 |
| **Parent** | [SPECIFICATION.md](./SPECIFICATION.md) · [SERVER-AND-NETWORK.md §3.1](./SERVER-AND-NETWORK.md#31-repository-layout-monorepo) |

This document explains how the Go services (`cmd/api`, `cmd/worker`, and the persistence side of `cmd/gameserver`) are layered: transport, application services, domain model and database access. It ends with a complete vertical slice (user registration) and a list of learning resources.

---

## 1. How Go does layers (coming from Java/C#/Node)

Go has no dominant framework (there is no Spring, ASP.NET or NestJS), and the community mostly avoids them. The same ideas still apply, built from plain packages:

| Idea | Typical Go form |
|---|---|
| Layer / module | A **package** (a directory). Package boundaries are the architecture. |
| Dependency direction | **Imports point inward**: transport → service → domain. The domain imports nothing from the project except other domain packages. Go forbids import cycles, which enforces this. |
| Interfaces | **Defined by the consumer**, small, often one or two methods. "Accept interfaces, return structs." The service declares the `Repository` interface it needs, and the store package implements it without importing the service. |
| Dependency injection | **Constructor functions** (`NewService(repo, clock)`) wired by hand in `main`. No DI container. |
| ORM | Usually **none**. SQL is written by hand and type-safe Go is generated from it (sqlc). See §3. |
| Exceptions | Returned `error` values. Domain packages define sentinel errors (`ErrUsernameTaken`) that the transport layer maps to HTTP status codes. |
| Packaging | **By feature** (`account`, `rating`, `leaderboard`), not by kind (`models`, `controllers`, `services`). |

## 2. The layers in this project

```
           ┌───────────────────────────────────────────────┐
 HTTP/WS → │ Transport   internal/api (chi), transport/ws  │  decode, validate, auth, map errors → status
           └──────────────────────┬────────────────────────┘
                                  ▼
           ┌───────────────────────────────────────────────┐
           │ Application  internal/account, internal/      │  use cases: transactions, orchestration,
           │ services     matchresult, internal/leaderboard │  defines the Repository interfaces it needs
           └──────────────────────┬────────────────────────┘
                                  ▼
           ┌───────────────────────────────────────────────┐
           │ Domain       internal/rating, internal/game,  │  pure Go: types + rules, no I/O, no SQL,
           │              internal/game/match, account     │  100 % unit-testable
           │              types (User, Username)           │
           └───────────────────────────────────────────────┘
                                  ▲ implements interfaces
           ┌──────────────────────┴────────────────────────┐
           │ Infrastructure internal/store (pgx + sqlc),   │  SQL, transactions, mapping rows ↔ domain,
           │                internal/events (Pub/Sub)       │  pg error codes → domain errors
           └───────────────────────────────────────────────┘
```

**Rules:**

1. `internal/game`, `internal/game/match` and `internal/rating` are **pure domain**. They never import `store`, `pgx`, `net/http` or `time.Now()`. This is already required for deterministic replays.
2. Services hold the use-case logic and own **transaction boundaries**. A service method is one use case (`Register`, `RecordMatch`).
3. The store maps between generated sqlc row structs and domain types. **sqlc structs never leave `internal/store`** on the write path.
4. **Read-only queries may skip the domain** (light CQRS). For example, the leaderboard handler calls a `leaderboard.Reader` that returns DTO rows straight from SQL. There are no rules to protect there, so mapping through domain objects would add nothing.
5. Handlers contain no business logic. They decode, call one service method, and encode.

### 2.1 Package additions to the layout

The layout in [Server & Network §3.1](./SERVER-AND-NETWORK.md#31-repository-layout-monorepo) gains these packages:

```
internal/account        User, Username, Email (domain types + validation), Service: Register, Login, Refresh
internal/leaderboard    Reader interface + read DTOs (leaderboard, profile, match history, rating history)
internal/matchresult    Service.RecordMatch: the worker's use case (inbox → persist → ratings → notify), uses internal/rating
internal/store          pgxpool setup, TxManager, repository implementations
  queries/*.sql         SQL with sqlc annotations (source of truth for queries)
  db/                   sqlc-generated code (never edited by hand)
  migrations/*.sql      golang-migrate files (expand/contract, see CI-CD.md §5)
sqlc.yaml
```

## 3. Database access: why no ORM

| Option | What it is | Fit for us |
|---|---|---|
| `database/sql` | Standard library, driver-agnostic | Works, but verbose, and loses pgx features |
| **`pgx/v5` (native)** | Fast PostgreSQL driver + `pgxpool` | **Used** as the driver: JSONB, `LISTEN/NOTIFY`, COPY, IAM auth via the Cloud SQL connector |
| **`sqlc`** | Generates type-safe Go from `.sql` files at build time | **Used** for all queries. SQL errors and type mismatches fail at `sqlc generate` (in CI), not at runtime. No reflection. |
| `sqlx` / `scany` | Thin helpers that scan rows into structs | Fine, but queries are only checked at runtime |
| GORM / ent / Bun | Full ORMs / query builders | Rejected. Our schema relies on Postgres features ORMs handle poorly: `FOR UPDATE` in sorted lock order, partial indexes, JSONB, `pg_notify`, an outbox and inbox tables. ORMs also hide the queries that run in the hot path of the rating worker. |

**Migrations:** `golang-migrate`, plain `.sql` up/down files. sqlc reads the same migration files as its schema, so generated code always matches the real schema.

## 4. Vertical slice: user registration

Use case: `POST /api/auth/register` creates a user **and** their `player_ratings` row (1200) in one transaction.

### 4.1 Migration (`internal/store/migrations/0001_users.up.sql`)

The schema is in [SPECIFICATION §7](./SPECIFICATION.md#7-data-model-postgresql). `users` and `player_ratings` are shown there.

### 4.2 Queries (`internal/store/queries/users.sql`)

```sql
-- name: CreateUser :one
INSERT INTO users (id, username, email, password_hash)
VALUES ($1, $2, $3, $4)
RETURNING id, username, email, created_at;

-- name: CreatePlayerRating :exec
INSERT INTO player_ratings (user_id) VALUES ($1);

-- name: GetUserByUsername :one
SELECT id, username, email, password_hash, created_at, last_login_at
FROM users WHERE username = $1;
```

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

`sqlc generate` then produces, among others:

```go
func (q *Queries) CreateUser(ctx context.Context, arg CreateUserParams) (CreateUserRow, error)
func (q *Queries) CreatePlayerRating(ctx context.Context, userID uuid.UUID) error
func (q *Queries) WithTx(tx pgx.Tx) *Queries
```

### 4.4 Domain (`internal/account/user.go`)

```go
package account

var (
    ErrUsernameTaken   = errors.New("username taken")
    ErrEmailTaken      = errors.New("email taken")
    ErrInvalidUsername = errors.New("invalid username")
)

type User struct {
    ID        uuid.UUID
    Username  Username
    Email     string
    CreatedAt time.Time
}

// Username is validated once, at construction; a Username value is always valid.
type Username string

func NewUsername(s string) (Username, error) {
    if !usernameRe.MatchString(s) { // 3–16 chars, [A-Za-z0-9_]
        return "", ErrInvalidUsername
    }
    return Username(s), nil
}
```

### 4.5 Service (`internal/account/service.go`)

```go
package account

// Repository is declared here, by the consumer. internal/store implements it.
type Repository interface {
    // CreateWithRating inserts the user and their initial rating atomically.
    CreateWithRating(ctx context.Context, u User, passwordHash string) (User, error)
    ByUsername(ctx context.Context, name Username) (User, string, error)
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
    hash, err := s.hasher.Hash(password) // argon2id
    if err != nil {
        return User{}, fmt.Errorf("hash password: %w", err)
    }
    return s.repo.CreateWithRating(ctx, User{ID: uuid.New(), Username: name, Email: email}, hash)
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
            ID: u.ID, Username: string(u.Username), Email: u.Email, PasswordHash: hash,
        })
        if err != nil {
            return mapUniqueViolation(err)
        }
        if err := q.CreatePlayerRating(ctx, row.ID); err != nil {
            return err
        }
        out = account.User{ID: row.ID, Username: account.Username(row.Username),
            Email: row.Email, CreatedAt: row.CreatedAt}
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

### 4.7 Handler (`internal/api/auth.go`)

```go
type registerRequest struct {
    Username string `json:"username"`
    Email    string `json:"email"`
    Password string `json:"password"`
}

func (h *Handlers) register(w http.ResponseWriter, r *http.Request) {
    var req registerRequest
    if err := decodeJSON(r, &req); err != nil {
        writeError(w, http.StatusBadRequest, "bad_request", err)
        return
    }
    user, err := h.accounts.Register(r.Context(), req.Username, req.Email, req.Password)
    switch {
    case errors.Is(err, account.ErrUsernameTaken), errors.Is(err, account.ErrEmailTaken):
        writeError(w, http.StatusConflict, "taken", err)
    case errors.Is(err, account.ErrInvalidUsername):
        writeError(w, http.StatusUnprocessableEntity, "invalid_username", err)
    case err != nil:
        writeError(w, http.StatusInternalServerError, "internal", err) // logged, not exposed
    default:
        h.issueTokens(w, r, user) // access JWT + refresh cookie
    }
}
```

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
    pool, err := store.Connect(ctx, cfg.DatabaseURL) // Cloud SQL connector + IAM auth in prod
    if err != nil {
        return err
    }
    defer pool.Close()

    st := store.New(pool)
    accounts := account.NewService(st, auth.Argon2Hasher{}, time.Now)
    srv := api.NewServer(cfg, accounts, st /* leaderboard.Reader */, slog.New(slog.NewJSONHandler(stdout, nil)))
    return httpserver.Run(ctx, cfg.Addr, srv) // graceful shutdown on ctx.Done()
}
```

`run` takes its environment as arguments, so tests can start the whole service in-process. This follows Mat Ryer's pattern (see §6).

## 5. Testing per layer

| Layer | Test style | Tooling |
|---|---|---|
| Domain (`rating`, `game`, `match`, `account` types) | Table-driven unit tests, fuzz, benchmarks | `testing` only |
| Services | Unit tests with small hand-written fakes of `Repository` (a map in a struct). No mocking framework needed. | `testing` |
| Store | Integration tests against **real Postgres 17**, each test in a rolled-back transaction or a fresh schema | `-tags=integration`, compose in CI ([CI-CD §4.1](./CI-CD.md#41-ci-pull-requests-ciyaml)) |
| Handlers | `httptest` with a fake service; one end-to-end test calls `run()` against the test DB | `net/http/httptest` |

## 6. Learning resources

| Resource | Type | Why |
|---|---|---|
| [Organizing a Go module](https://go.dev/doc/modules/layout) | Official docs | `cmd/`, `internal/`, and when to split packages |
| [How I write HTTP services in Go after 13 years](https://grafana.com/blog/how-i-write-http-services-in-go-after-13-years/) (Mat Ryer, 2024) | Article | `run()` pattern, `NewServer`, handlers, testing. §4.8 follows it. |
| [How Do You Structure Your Go Apps?](https://www.youtube.com/watch?v=oL6JBUk6tj0) (Kat Zien, GopherCon 2018) | Video | Flat vs. layered vs. modular vs. DDD/hexagonal layouts, with one example app refactored each way |
| [Achieving maintainability with hexagonal architecture](https://www.youtube.com/watch?v=vKbVrsMnhDc) (Kat Zien, dotGo 2019) | Video | Short follow-up on ports and adapters |
| [Wild Workouts](https://github.com/ThreeDotsLabs/wild-workouts-go-ddd-example) (Three Dots Labs) | Sample project + article series | A real app refactored step by step to DDD, Clean Architecture and CQRS, deployed on **Cloud Run** with Terraform. More DDD than we need; read it for the repository and CQRS parts. |
| [WTF Dial](https://github.com/benbjohnson/wtf) (Ben Johnson) | Sample project | Small, complete app using the "domain types in the root, implementations in subpackages" layout |
| [sqlc: Getting started with PostgreSQL](https://sqlc.readthedocs.io/en/stable/tutorials/getting-started-postgresql.html) and [Using Go and pgx](https://sqlc.readthedocs.io/en/stable/guides/using-go-and-pgx.html) | Official docs | Exactly the stack in §3–§4 |
| [pgx](https://github.com/jackc/pgx) | Docs / repo | Driver, `pgxpool`, `pgx.BeginFunc`, error codes |
| [Backend master class: Generate CRUD Golang code from SQL](https://www.youtube.com/watch?v=prh0hTyI1sU) (TECH SCHOOL) | Video series | Long free YouTube course building a bank backend with Postgres, golang-migrate, sqlc and transactions. Closest to our stack as a step-by-step series. |
