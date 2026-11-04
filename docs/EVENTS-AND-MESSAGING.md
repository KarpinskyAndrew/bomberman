# BomberMan Online: Events & Messaging

| | |
|---|---|
| **Version** | 0.2 (draft) |
| **Date** | 2026-11-11 |
| **Parent** | [SPECIFICATION.md](./SPECIFICATION.md) · Related: [SERVER-AND-NETWORK.md](./SERVER-AND-NETWORK.md), [GUI-PLAN.md](./GUI-PLAN.md) |

**Changes in 0.2:** v1 runs on one VM (spec §8). The rating worker uses a Pub/Sub **pull** subscription instead of push to Cloud Run (§7.1). The inbox is keyed per consumer, and per-round results go to `match_round_players` ([DATABASE.md](./DATABASE.md)). Integration tests use the compose file from CI instead of testcontainers (§11).

This document covers how events are produced, transported and handled across the system, whether a message queue is needed, and how match results turn into ELO ratings reliably.

---

## 1. Summary of Decisions

| Question | Decision |
|---|---|
| Do we need a message queue? | **Yes, but only for durable domain events** (match results → stats/ELO/analytics). |
| Which one? | **Google Cloud Pub/Sub** (managed, global, durable, has dead-letter topics and a BigQuery sink, nothing to operate on the v1 VM). |
| Queue for in-game events? | **No.** They stay in-process (Go channels / ring buffers) and go straight onto the client socket. A broker would add tens of ms and gives no benefit. |
| Queue for lobby updates? | **No.** v1 uses an in-process hub. v2 uses Redis pub/sub. These updates are ephemeral and only the latest value matters. |
| Push "your rating changed" to clients? | PostgreSQL **`LISTEN/NOTIFY`**, sent from inside the rating transaction, so it fires only when the change is committed. |
| Delivery guarantee | **At-least-once** delivery + **idempotent consumers** (inbox table) = exactly-once **effect**. |
| Producer with a database (API) | **Transactional outbox** (introduced when the first consumer of user events exists, see §6.2). |
| Producer without a database (game server) | **Publish directly with a bounded local spool**, and flush on shutdown. |
| Database | **PostgreSQL 17** (a container on the v1 VM, Cloud SQL in v2). It is the only system of record. Pub/Sub is transport, not storage. |

---

## 2. Event Taxonomy

There are three classes of events. They have different requirements, so each uses a different mechanism.

| Class | Examples | Latency need | Durability | Audience | Mechanism |
|---|---|---|---|---|---|
| **A. Real-time game events** | `BOMB_EXPLODED`, `WALL_DESTROYED`, `PLAYER_ELIMINATED` | **ms** | None needed. The match is in memory, and clients resync from state. | Clients in one arena | Arena goroutine → coalescing outbox → WS/WT (§3) |
| **B. Ephemeral notifications** | Lobby arena list changes, `rating.updated` push, server draining | < 1 s | None. Clients can always re-fetch the current state. | Connected clients | In-process hub (v1) / Redis pub/sub (v2) / Postgres `NOTIFY` (§7, §8) |
| **C. Durable domain events** | `match.finished`, *(v1.1)* `user.registered`, `user.deleted` | Seconds | **Must not be lost** | Backend services, analytics | **Cloud Pub/Sub** (§4–§6) |

**Rule of thumb:** if losing the event changes anyone's data (rating, stats, history), it is class C. If the receiver can recover by reading the current state, it is class A or B.

---

## 3. Real-Time Game Event Handling (class A)

### 3.1 Server side: best practices applied

1. **Events are facts, commands are intents.**
   - Clients send *commands* (`CMD`: "I want to move left / place a bomb"). The server validates them.
   - The simulation emits *events* in the past tense ("bomb placed", "wall destroyed").
   - Clients never send events.
2. **There is a single writer.** Only the arena goroutine creates events for its arena, so no locks are needed and the order is well defined.
3. **The order is deterministic.**
   - Events are appended in the simulation's fixed update order (see Server & Network §3.2).
   - Every event carries `tick` and an **arena-scoped, gap-free `eventSeq`** (u32, increasing by 1).
   - The same seed + commands therefore always produce the same event stream. Golden tests rely on this.
4. **Payloads are minimal.**
   - Events carry only what the client cannot derive. For example, `BOMB_EXPLODED` carries the fire lengths per direction, and the client works out the tiles.
   - Implicit expiries such as fire ending after 30 ticks are not sent at all.
5. **Each event has an audience.** It is either **broadcast** (default) or **targeted** to one slot (`BOMB_REJECTED`). Targeted events take part in the same `eventSeq` numbering per receiving connection (see 3.3).
6. **Delivery never blocks.** Events go into each connection's coalescing outbox (Server & Network §3.4). A slow consumer is disconnected and resynced. It can never stall the tick.
7. **Recent events are kept for replay.** The arena keeps a **ring buffer of the last 10 s of encoded events** (600 ticks). A reconnecting client sends its `lastEventSeq`:
   - If the gap is still inside the buffer, the server sends only the missing events plus the current snapshot. This is cheap and nothing visibly jumps.
   - Otherwise the server sends `FULL_STATE`.
8. **Internal observers run inside the tick and do no I/O.** Inside the arena goroutine, cheap synchronous observers subscribe to the sim's event slice:
   - **MatchRecorder** keeps per-player counters (kills, alien kills, walls, items, bombs), elimination ticks and causes. When the match ends, it builds the `match.finished` domain event.
   - **Telemetry** counts events by kind.

   Observers must not allocate, block or perform I/O. Anything heavy is handed off through a channel.

```go
type Observer interface{ OnEvents(tick uint32, evs []game.Event) } // called on the arena goroutine

func (a *Arena) publish(evs []game.Event) {
    for _, o := range a.observers { o.OnEvents(a.sim.Tick, evs) } // recorder, telemetry
    frame := a.encoder.EncodeEvents(evs)                          // once, shared
    a.replay.Append(a.sim.Tick, frame)                            // 10 s ring buffer
    for _, c := range a.conns { c.outbox.AddEvents(frame) }       // non-blocking
}
```

### 3.2 Client side: best practices applied

```
socket ─► codec.decode ─► EventDispatcher
                              │ 1. dedupe / gap check (eventSeq)
                              │ 2. apply to World (pure reducer, the only mutator)
                              │ 3. notify presentation subscribers (read-only)
                              ├─► EffectsSystem   (explosion sprites, debris)
                              ├─► AudioSystem     (boom, pickup sound)
                              ├─► KillFeed        (via hudBridge → Pinia)
                              └─► HudBridge       (hp/range/bombs changes)
```

1. **There is one mutator.** Only the World reducer changes game state. Effects, audio and HUD **subscribe** and only read, so presentation code cannot corrupt the simulation state.
2. **Handlers are idempotent.** Events with `eventSeq ≤ lastAppliedSeq` are ignored. This makes replay after a reconnect safe.
3. **Gaps are detected.** If `eventSeq > lastAppliedSeq + 1`, the client stops applying events and sends `resync` (JSON control message). It then rebuilds from `FULL_STATE`. This should never happen over WebSocket, but it guards against bugs and the future WebTransport transport.
4. **Handling is exhaustive.** Events are a TypeScript discriminated union. The dispatcher's `switch` ends in an `assertNever(e)` check, so adding an event kind without handling it fails at compile time. In Go, an unknown kind increments `client_unknown_event_total` and is logged.
5. **Effects are scheduled by tick.** Presentation uses the event's `tick` together with the estimated clock offset (Server & Network §6.5) to start animations at the right moment. For example, a bomb's fuse is drawn from `explodeTick`, not from when the message arrived.
6. **Effects are pooled.** Particles, sprites and floaters come from object pools, so a large chain reaction does not cause garbage-collection stutter.
7. **Vue never sees raw events.** At most, `hudBridge` pushes *derived, throttled* state (≤ 10 Hz) into Pinia (GUI Plan §5.3).

### 3.3 Protocol additions (see Server & Network §5)

- A `TICK` frame with events carries `u32 firstEventSeq`. The events in the frame are numbered consecutively from it.
- **Targeted events** (`BOMB_REJECTED`) are sent in a separate per-connection sequence space, `u16 privSeq`, so broadcast frames stay byte-identical for every client and only need to be encoded once.
- Resume uses the JSON control message `arena.resume {arenaId, lastEventSeq}`.

---

## 4. Do We Need a Message Queue?

### 4.1 Where a queue would be wrong

| Use | Why not |
|---|---|
| In-game events and commands | A broker hop adds **10–100 ms** and jitter, while the whole latency budget is about 50 ms. Arena state lives in one goroutine, so Go channels already are the queue. Ordering and backpressure are handled in-process. |
| Lobby list updates | Only the newest state matters, old updates are worthless, and losing one is healed by the periodic refresh. A durable queue would store and redeliver stale data. |
| Request/response between API and game server | It is synchronous by nature. Plain HTTP/gRPC with a timeout is simpler. |

### 4.2 Where a queue is the right tool: match results

When a match ends, several things must happen: write the match and its players, update stats, compute and apply ELO, notify players, and feed analytics.

| Reason | Without a queue | With Pub/Sub |
|---|---|---|
| **Decoupling from the database** | The game server must write to PostgreSQL. A slow or failing DB affects game servers, and failover or maintenance windows (minutes) mean lost results. | The game server publishes in about 20–50 ms, asynchronously and off the tick path. The DB can be down for **up to 7 days** (subscription retention) and results are applied when it comes back. |
| **Durability** | Results only exist in game server memory until they are written. A pod crash or deploy loses them. | After Pub/Sub acknowledges the publish, the result is stored durably across zones. |
| **Multi-region (v2)** | Game servers in 3 regions write to one primary DB across continents, which means latency, connection limits and VPC complexity. | Pub/Sub is **global**: each game server publishes to its local regional endpoint, and the worker in the primary region consumes everything. |
| **Retries & poison messages** | Retry, backoff and quarantine logic would have to be written by hand. | Built-in retry policy (exponential backoff) and **dead-letter topics**. |
| **Fan-out** | Every new consumer means changing the game server. | New subscription = new consumer: a BigQuery sink for analytics, and later achievements, anti-cheat review, etc. |
| **Serialized, auditable ELO** | ELO logic would be spread across game servers. | **One consumer** owns all rating logic, and the full input history is replayable from the event log in BigQuery. |
| **Security** | Game servers need DB write credentials. | Game servers can only *publish*. Only the worker can write ratings (least privilege). |

### 4.3 Options compared

| Option | Managed on GCP | Durability / DLQ | Ops effort | Fit |
|---|---|---|---|---|
| **Cloud Pub/Sub** | ✅ fully | ✅ / ✅ built-in | Very low | **Chosen.** Native GCP: pull or push subscriptions, BigQuery subscriptions, global topics, IAM, emulator for dev. Nothing extra runs on the v1 VM. |
| Redis Streams (Memorystore) | ✅ | ⚠ memory-bound, persistence options limited / manual DLQ | Medium | Good for ephemeral fan-out (we use Redis pub/sub for the lobby in v2), weak as a durable record. |
| NATS JetStream | ❌ self-host on GKE | ✅ / manual | High | Excellent latency, but the operations burden is not justified at our volume. |
| Managed Service for Apache Kafka | ✅ | ✅ / manual | Medium-high, costly baseline | Overkill: our volume is thousands of events per day, not millions per second. |
| PostgreSQL as a queue (outbox + `SKIP LOCKED`) | ✅ (it's our DB) | ✅ / manual | Low | Fine for single-region producers that already have a DB, but the game server has **no** DB and multi-region makes it awkward. We use this pattern only as the **outbox** feeding Pub/Sub. |

**Why keep a queue when v1 is one server?** In v1 the database runs on the same VM as the game server, so Pub/Sub does not protect against losing the machine. It still pays off: the game server keeps no DB credentials and never waits on the DB, results survive database restarts, migrations and a full restore (they wait in the subscription for up to 7 days), the rating logic has one owner, and moving to v2 (several game servers, Cloud SQL) changes nothing in this pipeline.

**Cost estimate:** about 5k matches/day × about 3 KB = about 15 MB/day. That is well inside Pub/Sub's free tier (10 GiB/month), so the queue is effectively free at launch scale.

---

## 5. Domain Event Contract (class C)

### 5.1 Envelope (CloudEvents 1.0, Pub/Sub binding)

Pub/Sub message **attributes**:

| Attribute | Example | Purpose |
|---|---|---|
| `ce-specversion` | `1.0` | CloudEvents version |
| `ce-id` | `0192f6c1-…` (UUIDv7) | **Idempotency key** |
| `ce-type` | `com.bomberman.match.finished.v1` | Type + **major version** |
| `ce-source` | `/gameserver/europe-west3/pod-7` | Producer |
| `ce-time` | `2026-10-27T18:22:05.120Z` | Occurred at |
| `ce-subject` | `match/0192f6c0-…` | Aggregate ID |
| `traceparent` | W3C trace context | Distributed tracing (Cloud Trace) |

The **data** is JSON, validated against a **Protobuf schema attached to the topic** (Pub/Sub schema, JSON encoding). Invalid messages are rejected at publish time.

### 5.2 Naming & versioning rules

- Names follow `<aggregate>.<past-tense-verb>`, for example `match.finished` and `user.registered`.
- **Only additive changes** are allowed within a major version (new optional fields). Consumers must ignore unknown fields.
- A breaking change requires a new type `….v2`:
  1. The producer **dual-publishes** v1 and v2 during migration.
  2. Consumers migrate.
  3. v1 is removed.
- Schemas live in `/protocol/events/*.proto` and are reviewed like code. CI checks backward compatibility with `buf breaking`.
- **Events carry facts, consumers make decisions.** For example, the game server reports `mode`, `ruleset`, `bestOf`, match placements and each player's `registered` flag, and the **rating worker** decides whether the match is rated (spec §5.4.2). Rating policy therefore lives in exactly one place.

### 5.3 Catalogue

| Event | Producer | Topic | Consumers (subscriptions) | Status |
|---|---|---|---|---|
| `match.finished.v1` | Game server (MatchRecorder) | `match-events` | `rating-worker` (pull), `match-events-bq` (BigQuery, optional) | **v1** |
| `match.aborted.v1` | Game server (drain timeout, all players left during countdown…) | `match-events` | `match-events-bq` (audit). Never rated. | v1 |
| `user.registered.v1` | API service (outbox) | `user-events` | *(future)* welcome email, analytics | v1.1 |
| `user.deleted.v1` | API service (outbox) | `user-events` | Analytics erasure (GDPR) | v1.1 |

### 5.4 `match.finished.v1` payload

```json
{
  "matchId": "0192f6c0-7d1e-7c3a-9f21-5b1c2e8d4a10",
  "arenaId": "a-7KQ2",
  "arenaName": "Friday Blast",
  "region": "europe-west3",
  "mode": "ranked",
  "private": false,
  "ruleset": "standard",
  "bestOf": 3,
  "startedAt": "2026-10-27T18:19:02.004Z",
  "endedAt":   "2026-10-27T18:26:41.530Z",
  "durationMs": 459526,
  "result": "win",
  "players": [
    { "slot": 1, "userId": "0191…", "registered": true,  "displayName": "Andrew",
      "placement": 1, "roundWins": 2, "roundPoints": 8, "forfeited": false,
      "kills": 3, "alienKills": 5, "wallsDestroyed": 41, "powerupsTaken": 11, "bombsPlaced": 97 },
    { "slot": 2, "userId": "0190…", "registered": true,  "displayName": "Kate",
      "placement": 2, "roundWins": 1, "roundPoints": 7, "forfeited": false,
      "kills": 1, "alienKills": 2, "wallsDestroyed": 25, "powerupsTaken": 6, "bombsPlaced": 61 }
  ],
  "rounds": [
    { "roundNo": 1, "seed": 884211990123, "durationMs": 183116, "result": "win", "winnerSlot": 1,
      "players": [
        { "slot": 1, "placement": 1, "points": 3, "eliminatedTick": null, "deathCause": null },
        { "slot": 2, "placement": 2, "points": 2, "eliminatedTick": 9120, "deathCause": "bomb", "killerSlot": 1 }
      ],
      "inputLogUri": "gs://bomberman-replays/2026/10/27/0192f6c0…-r1.bin" },
    { "roundNo": 2, "...": "…  Kate wins" },
    { "roundNo": 3, "...": "…  Andrew wins → 2 round wins, match decided" }
  ]
}
```

The example is a ranked 1-vs-1. An unrated match has the same shape with `"mode": "unrated"`, `"bestOf": 1`, 2–4 players (guests have `"userId": null, "registered": false`) and exactly one entry in `rounds`.

- **One event per match** (ranked best-of-3 or unrated single round), published at MATCH_END. Rounds are **not** published one at a time: rating is per match, and a half-finished match must never be partially persisted.
- If the match is aborted (server drain or crash, see §9), no `match.finished` is published. If possible a `match.aborted` is published instead, and it is never rated.

---

## 6. Producers

### 6.1 Game server: direct publish with a local spool

The game server has no database, so a transactional outbox is not possible. It uses:

1. When a match ends, **MatchRecorder** builds the event on the arena goroutine and hands it to the **EventPublisher** goroutine through a buffered channel (non-blocking; if the channel is full, the event goes straight to the spool).
2. The EventPublisher uses the official Pub/Sub Go client with:
   - the **regional endpoint** (e.g. `europe-west3-pubsub.googleapis.com`),
   - batching delay of 10 ms,
   - the client library's built-in retries.
3. **If publishing fails** after the client's retry deadline (60 s), the event goes into a **bounded in-memory spool**: up to 10,000 events / 50 MB, retried with exponential backoff up to 5 min. `pubsub_spool_depth` is exported, with an alert when it is above 0 for more than 5 min.
4. **Graceful shutdown** (SIGTERM / draining) blocks until the spool and all in-flight publishes are acknowledged, within the grace period.
5. The `matchId` / `ce-id` is generated **once**, so a publish retry can never create a second logical event. Duplicates are removed by the consumer.

**Accepted risk:** if a pod crashes hard in the milliseconds between a match ending and Pub/Sub acknowledging the publish, that match is lost. It is then simply unrated. The window is about 50 ms per match and is monitored (`match_publish_lost_total`, derived from comparing ended-match and acknowledged counts).

### 6.2 API service: transactional outbox (v1.1, when the first consumer exists)

When a business change and its event must be atomic (e.g. registering a user and emitting `user.registered`):

```sql
BEGIN;
INSERT INTO users (...) VALUES (...);
INSERT INTO outbox (id, topic, event_type, payload) VALUES ($1, 'user-events', 'user.registered.v1', $2);
COMMIT;
```

- An **outbox relay** goroutine runs in each API instance. It wakes on `LISTEN outbox_new` or every 1 s, and runs:

  ```sql
  SELECT * FROM outbox WHERE published_at IS NULL
  ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED;
  ```

  It publishes those rows and then sets `published_at`.
- `SKIP LOCKED` lets several API instances run the relay safely in parallel.
- Delivery is at-least-once, because a crash between publishing and the update republishes the row. The consumers are idempotent.
- In v1 nothing consumes user events yet, so **the outbox table is created but the relay is turned on only in v1.1**. This avoids building machinery nobody uses.

---

## 7. Consumer: Rating Worker

### 7.1 Delivery setup

| Setting | Value |
|---|---|
| Subscription | `rating-worker` on `match-events`, **pull** (streaming pull with the official Go client, `sub.Receive`) |
| Why pull | The worker runs inside the VM with no public endpoint, so there is nothing for Pub/Sub to push to. Pull also gives flow control for free. |
| Auth | The VM's service account (subscriber role on this subscription only). Locally the emulator needs no auth. |
| Ack | The handler returns → `msg.Ack()` after the transaction commits. An error → `msg.Nack()`, and the retry policy applies. |
| Ack deadline | 60 s (the client library extends it automatically while a message is being processed) |
| Retry policy | Exponential backoff from 10 s to 600 s |
| Dead letter | After **10** delivery attempts → `match-events-dlq`. An alert fires on any message there. |
| Retention | 7 days |
| Concurrency | `ReceiveSettings.MaxOutstandingMessages = 10`. Row locks serialize the conflicting updates (§7.3). |

Pub/Sub's *exactly-once delivery* option is available for pull subscriptions, but it is not needed here: **the inbox makes processing idempotent no matter how the message is delivered.**

### 7.2 Processing transaction (idempotent, atomic)

```sql
BEGIN;  -- READ COMMITTED is sufficient: rating rows are locked explicitly

-- 1. Inbox / idempotency
INSERT INTO processed_events (consumer, event_id, event_type)
VALUES ('rating-worker', $ce_id, 'match.finished.v1')
ON CONFLICT DO NOTHING;
-- 0 rows inserted → duplicate delivery → COMMIT and Ack. Done.

-- 2. Persist the match (only if ≥ 1 registered player; guest-only matches go to BigQuery only)
INSERT INTO matches (...) VALUES (...);
INSERT INTO match_players (...) VALUES (...), (...);           -- before rounds: rounds FK the winner slot
INSERT INTO match_rounds (...) VALUES (...), (...), (...);   -- one row per round played
INSERT INTO match_round_players (...) VALUES (...), ...;      -- one row per round × slot (DATABASE.md §3.9)
INSERT INTO user_stats (...) VALUES (...)
  ON CONFLICT (user_id) DO UPDATE SET matches_played = user_stats.matches_played + 1, ...;

-- 3. ELO (only if rated per spec §5.4.2, decided by internal/rating: ranked, exactly 2 registered players)
SELECT user_id, rating, rated_matches
FROM player_ratings
WHERE user_id = ANY($registered_ids)   -- always the 2 ranked players
ORDER BY user_id            -- consistent lock order → no deadlocks
FOR UPDATE;
--   Go: deltas := rating.Compute(a, b, result)   (pure two-player ELO, unit-tested)
UPDATE player_ratings SET rating = ..., peak_rating = GREATEST(peak_rating, ...),
       rated_matches = rated_matches + 1, updated_at = now() WHERE user_id = ...;
INSERT INTO rating_history (...) VALUES (...);
UPDATE match_players SET rating_before = ..., rating_after = ... WHERE match_id = ... AND slot = ...;
UPDATE matches SET rated = true WHERE id = ...;

-- 4. Notify (delivered only if COMMIT succeeds)
SELECT pg_notify('rating_updated', $json);  -- {matchId, players:[{userId, before, after, delta}]}

COMMIT;
```

### 7.3 Concurrency & ordering

- **Two matches finishing at the same time with overlapping players** is impossible in normal play, because a player is in only one arena at a time. It can still happen through redelivery. `FOR UPDATE` row locks serialize it, and the sorted lock order prevents deadlocks.
- **Out-of-order processing:**
  - Pub/Sub may redeliver an older match after a newer one has been processed.
  - Ratings are applied to the **current** rating at processing time ("processing-order ELO").
  - The deviation from strict chronological order is a few points at most and only happens under failures. This is accepted.
  - `rating_history` records the actual before and after values, so the audit trail stays consistent.
  - Ordering keys are deliberately **not** used: a match involves two players, so there is no single key to order by.
- **Users deleted after the match:** their `user_id` is set to null. A ranked match whose opponent no longer exists is persisted but not rated.

### 7.4 Error handling

| Error | Handling |
|---|---|
| DB unavailable / timeout | `Nack` → Pub/Sub redelivers with backoff. Nothing is lost. |
| Serialization or deadlock (should not happen) | Retry inside the worker up to 3 times, then `Nack`. |
| Invalid payload (schema passes, but semantically invalid, e.g. unknown slot) | Log at ERROR, report to Sentry and `Nack` → it ends up in the DLQ after the maximum number of attempts. It is fixed and replayed manually: `cmd/worker dlq-replay` republishes from the DLQ to the main topic. |
| Bug in the ELO code | DLQ + alert. After the fix, the messages are replayed. The inbox prevents double application for messages that were already processed. |

---

## 8. Notifications (class B)

### 8.1 Rating updates → players

```
rating-worker ──COMMIT──► PostgreSQL NOTIFY 'rating_updated'
                                    │
          game server(s): dedicated pgx connection, LISTEN rating_updated
                                    │ for each userId connected to this server
                                    ▼
                         JSON control message  {"t":"rating.updated", matchId, before, after, delta, tier, rank?}
```

- `NOTIFY` is **transactional** (sent only on commit) and **not durable**: a listener that is disconnected misses it. This is acceptable for a UI hint:
  - The results screen shows "rating updating…".
  - If no push arrives within **5 s**, the client calls `AccountService.GetMe` (gRPC) once.
  - The profile page always reads from the database.
- Each game server keeps **one** dedicated listener connection, which reconnects with backoff. The payload is far below Postgres's 8,000-byte NOTIFY limit.
- **v2 multi-region:** remote game servers LISTEN across regions. Latency does not matter for this path, and it costs one connection per pod. If the connection count becomes a problem, the worker can publish to Redis `notify:user:{id}` instead.

### 8.2 Lobby updates

| Version | Flow |
|---|---|
| **v1 (single instance)** | Arena actors send `ArenaChanged{summary}` to the in-process **LobbyHub** (buffered channel, last value per arena kept). The hub **debounces for 250 ms** and pushes `lobby.update` diffs to subscribed connections. A full `lobby.list` is sent on subscribe and every 30 s as self-healing. |
| **v2 (multi-pod)** | Each pod writes its arena summaries to Redis (`HSET arena:{id}`, TTL 10 s, refreshed every 2 s) and `PUBLISH lobby:updates`. Every pod's LobbyHub subscribes and fans out to its local clients. A lost message is harmless: the next refresh or the TTL fixes it. |

---

## 9. Failure Scenarios

| Scenario | Effect | Recovery |
|---|---|---|
| Database down / restarting / being restored | Games keep running. Ratings and profiles are delayed. Login/register (API) fails. | Pub/Sub keeps `match.finished` for up to 7 days, and the worker catches up automatically. |
| v1 VM down | Everything is down: running matches are lost (unrated), and no new games start. Already-published results are safe in Pub/Sub. | Restart the VM, or create a new one from the latest disk snapshot (CI-CD §6.3). The worker then drains the subscription. |
| Pub/Sub publish errors | Events wait in the game server spool. | Retried with backoff. An alert fires if the spool stays non-empty. |
| Game server crash **during** a best-of-3 match | The whole match is lost, including rounds already finished. No event is produced and no rating changes. Players reconnect and see "match interrupted". | None needed (fair to everyone). It is visible in the `arena_crash_total` metric. |
| Game server crash **after** the match ended, before the publish was acknowledged | The match result is lost, so the match is unrated. | Accepted risk (§6.1). It is monitored. |
| Duplicate delivery | None | Inbox `ON CONFLICT DO NOTHING`. |
| Worker bug / poison message | The message is retried, then moved to the DLQ. Other matches continue processing. | Fix, then `dlq-replay`. |
| `NOTIFY` missed | The results screen doesn't show the delta right away. | The client falls back to `AccountService.GetMe` after 5 s. |
| Client misses game events (gap) | The client stops applying events. | `resync` → `FULL_STATE` (§3.2). |
| Client reconnects within 10 s | None visible | Event replay from the ring buffer (§3.1). |

---

## 10. Observability

| Signal | Source | Alert |
|---|---|---|
| `pubsub_publish_latency_ms` | Game server (Prometheus) | p99 > 500 ms |
| `pubsub_spool_depth` | Game server (Prometheus) | > 0 for 5 min |
| `subscription/oldest_unacked_message_age` | Cloud Monitoring (Pub/Sub's own metric, alert policy there) | > 60 s |
| `subscription/dead_letter_message_count` (DLQ) | Cloud Monitoring | > 0 |
| `rating_processing_duration_ms` | Worker (Prometheus) | p95 > 500 ms |
| `match_end_to_rating_visible_ms` | Worker (`now − endedAt`) | p95 > 3 s |
| `duplicate_events_total` | Worker (inbox conflicts) | Informational |
| `client_resync_total`, `event_replay_total` | Game server | Spike |

- **Tracing:** the game server starts an OpenTelemetry span `match.finish`, and the `traceparent` attribute carries it into the worker's span. The OTel Collector exports both to Cloud Trace, so one trace view covers match end → publish → rating commit → notify.
- **Logs** always include `matchId`, `eventId` and `arenaId`.

---

## 11. Local Development & Testing

- **docker compose:**
  - `postgres:17`
  - `gcr.io/google.com/cloudsdktool/google-cloud-cli` running the **Pub/Sub emulator**
  - a bootstrap script that creates the topics and subscriptions
  - the game server, API and worker, with the worker using the same pull subscription code as in production
- **Tests:**

  | Kind | What it checks |
  |---|---|
  | Unit | `internal/rating`: two-player ELO math, draws, forfeits, K-factors, eligibility rules (ranked, 2 registered players), floor |
  | Contract | Golden `match.finished` JSON vs the `.proto` schema; `buf breaking` in CI |
  | Integration (`-tags=integration`, `server/test/compose.yaml`: Postgres 17 + Pub/Sub emulator, same as CI) | Deliver the same event twice → one rating change. Deliver two events out of order → consistent history. DB down → Nack → succeeds on redelivery. |
  | Simulation | Seeded matches produce the expected event streams (golden files) |
  | E2E | Finish a ranked match → the results screen shows the delta in < 3 s |
