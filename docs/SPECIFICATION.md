# BomberMan Online: Multiplayer Specification

| | |
|---|---|
| **Version** | 0.9 (draft) |
| **Date** | 2026-11-11 |
| **Stack** | Go (Gin, gRPC + buf, pgx, Goose), Vue 3 + TypeScript (Vite, Pinia, Tailwind, gRPC-Web), **PostgreSQL 17**, Envoy, Google Cloud (one Compute Engine VM in v1, Pub/Sub), GitHub Actions, OpenTelemetry + Prometheus + Sentry |

Related documents:

- [GUI Plan (Vue)](./GUI-PLAN.md): screens, components, rendering, input, UX.
- [Server & Network Design](./SERVER-AND-NETWORK.md): game server internals, binary protocol, latency minimization, deployment topology.
- [Events & Messaging](./EVENTS-AND-MESSAGING.md): event handling (in-game, notifications, domain events), the message queue decision, and the ELO pipeline.
- [CI/CD and v1 Deployment](./CI-CD.md): GitHub Actions, Artifact Registry, the single-VM Docker Compose deployment, and the path to GKE + Helm.
- [Go Backend Architecture](./BACKEND-ARCHITECTURE.md): layers, domain model, Gin + gRPC transport, database access (pgx + sqlc, no ORM), testing with testify + mockery, a worked example and learning resources.
- [Database Design](./DATABASE.md): the PostgreSQL schema (tables, constraints, FKs, indexes), its Go mapping, roles and migration plan.

### Changelog

| Version | Changes |
|---|---|
| 0.9 | **Ranked is 1-vs-1 only**, best-of-3, for registered players only. Rating uses standard two-player ELO (§5.4.3), replacing the pairwise multiplayer method. **Unrated matches (2–4 players) are a single round.** The waiting room starts a match with a **15 s all-ready countdown** instead of a host Start button (§5.2). Registration asks for the password twice. **Touch controls** (virtual joystick + bomb button) move into v1. **Arena size** is a setting: Small 15×15, Medium 17×17, Large 21×21, defaulting to the player count; Ranked is always Small (§4.1). |
| 0.8 | **v1 runs on one server**: a Compute Engine VM with Docker Compose (§8). GKE + Helm is the v2 scaling step. The API is split into **Gin** (auth with cookies, health) and **gRPC services** defined with **buf**, reached from the browser through **Envoy** (gRPC-Web) (§6.1). Migrations use **Goose**. CI/CD moves to **GitHub Actions**. Observability is **OpenTelemetry, Prometheus/Grafana and Sentry**. Pub/Sub stays. |
| 0.7 | The schema moves to **[DATABASE.md](./DATABASE.md)**, and §7 now only summarizes it. Per-round player results become a table (`match_round_players`) instead of JSONB. Password hashes move to `user_credentials`. |
| 0.6 | **Go confirmed** for the backend after reviewing the alternatives (§6.2). The game rules stay in Go. The client re-implements only what it predicts (own movement and bomb placement), and **shared test vectors generated from the Go simulation** keep the two in sync. The networking code we write ourselves is listed and sized in [Server & Network §3.6](./SERVER-AND-NETWORK.md#36-networking-code-build-vs-buy). |
| 0.5 | Confirmed 3 HP, 2–4 players and tile-by-tile movement. At the time-out, **the player with less HP loses** (§4.8.2). **EU-only regions** with EU data residency (§8.1). Added the **CI/CD on GCP** design ([CI-CD.md](./CI-CD.md)). |
| 0.4 | A **match is now best-of-3 rounds** (§4.8). ELO is applied once per match, from the match placement. There are two game modes, **Ranked** and **Unrated** ("casual" renamed). Permanent rating with **no seasons in v1**. Data model gains `match_rounds`. |
| 0.3 | **Touching an alien kills instantly.** Added **ranked play with ELO rating** (§5.4). Reworked event handling: three event classes, **Google Cloud Pub/Sub** for durable match results, outbox/inbox patterns, event sequence numbers and replay. PostgreSQL schema extended. Co-op mode removed from scope. |
| 0.2 | +Bomb collectible, aliens, 60 Hz simulation / 30 Hz snapshots, GUI and network design split into separate documents. |
| 0.1 | First draft. |

---

## 1. Overview

BomberMan Online is a browser-based, real-time multiplayer Bomberman game. Players can **register**, **log in**, or **play anonymously as a guest**. Many **battle arenas** run at the same time, and each one holds its own independent match. Inside an arena, players move around a grid of 15×15 to 21×21 tiles (smaller for fewer players), place bombs with **SPACE**, blow up destructible walls, avoid and hunt deadly computer-controlled **aliens**, collect power-ups and try to be the last one standing. Arenas run in one of two game modes:

- **Ranked:** a **1-vs-1** duel between two registered players, played as **best of 3 rounds**. The winner gains **ELO rating** and the loser loses it.
- **Unrated:** **2–4 players**, a **single round**, just for fun.

### 1.1 Goals

- Multiplayer in real time with **minimal perceived latency**. Your own movement and bombs react instantly, and other players appear within about 100 ms of real time in the same region (see [Server & Network](./SERVER-AND-NETWORK.md)).
- Many arenas running concurrently and isolated from each other.
- Getting into a game takes little effort: a guest can play within 2 clicks.
- The server is authoritative, so clients cannot cheat on positions, bombs or damage.
- A fair, tamper-resistant **ELO rating**, where match results are **never lost** even if the database is temporarily unavailable.
- Simple to deploy and run: **one server in v1** (§8), with a clear path to scale out on GKE in v2.

### 1.2 Non-goals (v1)

- **Co-op / PvE-only modes.** Aliens exist only inside PvP arenas.
- In-game chat (lobby chat is a v1.1 candidate).
- A ranked matchmaking queue. Ranked opponents are found through the arena list, and Quick Play only *prefers* arenas with a similar rating (§5.1).
- Spectator mode for people outside the match (eliminated players still spectate their own match).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Arena** | A game room. It has its own map, players, aliens and match lifecycle. |
| **Round** | A single game: one map, from countdown to the last player standing (or a draw). |
| **Match** | What an arena plays from start to final standings. **Ranked:** a best-of-3 series of rounds between 2 players. **Unrated:** exactly 1 round. ELO is applied per ranked match. |
| **Tile** | One cell of the arena grid (15×15, 17×17 or 21×21, §4.1). |
| **Hard wall** | An indestructible wall. |
| **Soft wall** | A destructible wall that is placed randomly and can be destroyed by fire. |
| **Fire / blast** | The cross-shaped explosion a bomb produces. |
| **Range** | How many tiles the fire reaches in each direction. |
| **Collectible** | A power-up item lying on a tile. A player picks it up by walking over it. |
| **Alien** | A computer-controlled enemy (NPC). Touching one kills a player instantly. |
| **Tick** | One step of the server simulation (60 Hz). |
| **Guest** | An anonymous player with no account. |
| **Game mode** | **Ranked** (1-vs-1, registered players only, standard rules locked, best-of-3, rated) or **Unrated** (2–4 players, guests welcome, custom rules allowed, single round, never rated). Set per arena. |
| **Rated match** | A Ranked match that meets the eligibility rules and therefore changes ELO (§5.4.2). |
| **ELO** | A skill rating system. Everyone starts at 1200, and each rated match moves rating points between players. |
| **Game event** | A real-time fact that happened inside an arena (bomb exploded, wall destroyed…), sent to clients. |
| **Domain event** | A durable business fact (e.g. `match.finished`) published to the message queue for other services. |

---

## 3. User Roles & Accounts

### 3.1 Roles

| Role | Can do |
|---|---|
| **Guest** | Choose a nickname (or have one generated), browse all arenas, and join/create and play **Unrated** arenas. Guests see Ranked arenas in the list but **cannot join them** ("Register to play Ranked"). Stats are **not** persisted. |
| **Registered user** | Everything a guest can do, plus **Ranked** play, a persistent profile, match history, statistics, an **ELO rating**, a leaderboard position and a reserved username. |

### 3.2 Registration

- Fields: `username` (3–16 chars, `[A-Za-z0-9_]`, unique and case-insensitive), `email` (unique, valid format) and `password` (min. 8 chars).
- The form asks for the password **twice** (`password` + `confirm password`). The client checks that both match before submitting, and the submit button stays disabled until they do. The API receives the password only once: the confirmation is a typo guard in the UI, not a server field.
- Passwords are hashed with **argon2id** (or bcrypt with cost ≥ 12).
- After a successful registration the user is logged in automatically, and a rating row (1200, provisional) is created.
- *(v1.1)* Email verification and password reset by email.

### 3.3 Login

- Login uses `username or email` + `password`.
- On success the server issues:
  - **Access token**: a JWT valid for 15 min. The client keeps it in memory and sends it in the `Authorization: Bearer` header and when connecting to the game socket.
  - **Refresh token**: opaque and random, valid for 30 days. It is stored hashed in the DB and sent as an `HttpOnly; Secure; SameSite=Strict` cookie.
- Logging out revokes the refresh token.
- Login attempts are rate-limited: 5 failures per 15 min per IP+account.

### 3.4 Anonymous (guest) play

- "Play as guest" asks for an optional nickname. If none is given, one is generated (e.g. `Guest-4821`).
- The server issues a **guest JWT** (`role: guest`, random `guestId`), valid for 24 h.
- Guest nicknames get a visible marker in game (e.g. grey name or a "guest" tag) and cannot impersonate registered usernames.
- Guests have no rating and **cannot join Ranked arenas** (§5.4.2). The server rejects `arena.join` for a guest with `ranked_requires_account`.

---

## 4. Game Rules

All durations below are given in seconds. The server counts them in **ticks at 60 Hz** (1 tick ≈ 16.7 ms). The tick value is shown in brackets.

### 4.1 Map

- The grid is square, **S × S** tiles, with three sizes:

  | Size | S | Default for | Default max aliens | Sudden-death speed |
  |---|---|---|---|---|
  | **Small** | **15** | 2 players, and **always in Ranked** | 2 | 1 tile / 0.75 s [45 ticks] |
  | **Medium** | **17** | 3 players | 3 | 1 tile / 0.65 s [39 ticks] |
  | **Large** | **21** | 4 players | 4 | 1 tile / 0.5 s [30 ticks] |

  - Fewer players get a smaller arena, so a duel doesn't turn into a long search for the opponent, and the arena stays readable on a phone.
  - The size follows the max players by default. In **Unrated**, the host can pick any size (e.g. 4 players on Small for chaos). **Ranked** is always Small.
  - S is always odd, so the border and pillar pattern below works the same for every size.
- Coordinates are `(x, y)` with `0 ≤ x, y ≤ S − 1` and the origin at the top-left.
- **Hard walls (indestructible):**
  - The outer border: every tile with `x = 0`, `x = S − 1`, `y = 0` or `y = S − 1`.
  - Pillars on every second row and column: every tile where **both `x` and `y` are even**.
- **Every other tile** (odd x or odd y, not on the border) is either **empty** or a **soft wall**, decided randomly when the match is generated:
  - Soft wall density: **65 %** by default (configurable in Unrated arenas: 40–85 %).
  - **Every round gets a new random map.**
  - **Spawn safe zones** are always empty: the spawn tile plus the two tiles next to it along the corridors (an L shape). This guarantees that a player can place a bomb and escape.
- Spawn points (up to 4 players), one per corner. With `E = S − 2` (the last walkable row/column: 13, 15 or 19):

  | Slot | Spawn | Safe tiles |
  |---|---|---|
  | P1 | (1, 1) | (2, 1), (1, 2) |
  | P2 | (E, 1) | (E − 1, 1), (E, 2) |
  | P3 | (1, E) | (2, E), (1, E − 1) |
  | P4 | (E, E) | (E − 1, E), (E, E − 1) |

  - With **2 players** they start in **opposite corners**: P1 at (1, 1) and P2 at (E, E). With 3 players the corners are P1, P2, P3 as listed.

- The map generator uses a seeded PRNG. Each round has its own seed, stored with the match, so the map, and with the recorded inputs the whole round, can be reproduced and debugged.

```
Legend: # hard wall   + soft wall (random)   . empty   1-4 spawn

#####################
#1..+++++++++++++..2#
#.#+#+#+#+#+#+#+#+#.#
#+++++++++++++++++++#
#+#+#+#+#+#+#+#+#+#+#
 ...       (rows repeat, + is randomly + or .)
#.#+#+#+#+#+#+#+#+#.#
#3..+++++++++++++..4#
#####################
```

### 4.2 Players

| Attribute | Start | Max | Changed by |
|---|---|---|---|
| Health (HP) | 3 | 5 | ❤ +Health collectible. Each bomb hit takes away 1 HP, and 0 HP means eliminated. |
| Fire range | 2 | 10 | 🔥 +Fire collectible. |
| **Bomb capacity** (bombs on the field at once) | **1** | **8** | 💣 **+Bomb** collectible. |
| Move speed | 1 tile / 0.15 s [9 ticks] | | Fixed in v1. |

- **Ways to take damage or die:**

  | Source | Effect |
  |---|---|
  | Bomb fire (any owner, including the player's own bombs) | −1 HP, followed by **1.5 s [90 ticks] of invulnerability** |
  | **Touching an alien** (§4.7.2) | **Instant elimination**, no matter how much HP is left and even while invulnerable |
  | Sudden-death wall | Instant elimination |

- While invulnerable, the player blinks on screen. Invulnerability protects **only against fire**.
- Players **can overlap** each other; players do not block movement.
- Eliminated players switch to spectating the rest of the round.
- **Each round starts fresh:** every player is back at the starting values above (3 HP, range 2, 1 bomb). Collectibles do **not** carry over between rounds.

### 4.3 Controls

| Action | Keyboard | Touch (phones, tablets) |
|---|---|---|
| Move | Arrow keys **or** W A S D | **Virtual joystick**, bottom-left |
| Place bomb | **SPACE** | **Bomb button**, bottom-right |
| Open menu / leave arena | ESC | ☰ button, top corner |

- If several direction keys are held at once, the most recently pressed one wins.
- Holding a direction keeps moving the player tile by tile.
- **Touch:** the joystick is a floating circle. It appears where the thumb lands in the left half of the screen, and the thumb's offset from that point picks the direction. Movement is tile-by-tile, so the offset is snapped to the nearest of the **4 directions**, with a dead zone in the middle (stop). Holding the thumb off-center works like holding a key. The touch layout is used when the device's primary pointer is coarse (`pointer: coarse`); keyboard hints are hidden then.
- Touch input produces exactly the same commands as the keyboard (direction held, bomb pressed), so prediction and the server need no changes.

### 4.4 Movement & tile occupancy

- Movement is **tile-based**. Each entity (player or alien) has a current tile, a movement direction and a movement progress from 0 to 1 toward the next tile. The client animates the move between tiles smoothly.
- An entity **occupies** its origin tile until it is more than 50 % of the way into a move, and occupies the destination tile from then on. Occupancy is what fire damage, pickups and alien contact are checked against.
- Neither players nor aliens can enter hard walls, soft walls or bomb tiles.
- **Bomb exception:** a player can stand on and leave the bomb they just placed. Once they step off that tile, it blocks them like any other bomb.
- A direction pressed while the player is between tiles is buffered and applied as soon as they reach the next tile. This keeps turning at intersections smooth.

### 4.5 Bombs

- Pressing SPACE places a bomb on the tile the player occupies, if:
  - the player is alive,
  - the tile holds no bomb, and
  - the player's **active bombs < bomb capacity**.
- When a bomb explodes, the slot frees up again.
- **Fuse:** 3.0 s [180 ticks].
- When the fuse runs out, the bomb **explodes** in a plus (+) shape. From the center, fire travels up to `range` tiles in each of the 4 directions:
  - A **hard wall** stops the fire, and that tile is not affected.
  - A **soft wall** stops the fire. The tile is **destroyed** and may drop a collectible (§4.6).
  - A **collectible** lying on the floor is destroyed by the fire, and the fire keeps going.
  - Another **bomb** is set off immediately (**chain reaction**), and the fire keeps going.
  - A **player** in the fire takes 1 damage unless they are invulnerable.
  - An **alien** in the fire takes 1 damage unless it is invulnerable (§4.7).
- Fire stays visible and harmful for **0.5 s [30 ticks]**. Anything that walks into active fire takes damage.
- The range used is the owner's range **at the moment the bomb was placed**.
- **Kill credit:** each fire tile remembers the owner of the bomb that produced it. If fire from two bombs overlaps on a tile, the bomb that exploded first owns it. Whoever owns the fire gets credit for any kill it causes.

### 4.6 Collectibles (power-ups)

| Collectible | Icon | Effect | Cap |
|---|---|---|---|
| **+Health** | ❤ | +1 HP (protects against bomb hits only, **not** against aliens) | 5 HP |
| **+Fire** ("damage") | 🔥 | +1 fire range | 10 |
| **+Bomb** | 💣 | +1 bomb capacity, so the player can have one more bomb on the field at the same time | 8 |

**Where collectibles come from:**

| Source | Drop chance | Weights: Health / Fire / Bomb |
|---|---|---|
| Destroyed soft wall | 30 % (configurable 0–60 % in Unrated arenas) | 20 / 40 / 40 |
| Killed alien | **100 %** (guaranteed) | 25 / 35 / 40 |

- A dropped collectible appears **after** the fire on its tile has ended, so it cannot be burned by the blast that uncovered it.
- A player picks it up as soon as they **occupy** the tile.
- If a player picks up a collectible while already at its cap, it is used up with no effect, but the pickup still counts in stats.
- A collectible that is hit by a later blast is destroyed. Collectibles dropped by aliens are **protected for 1 s [60 ticks]** after they appear.
- *(v1.1 candidates: +Speed, Kick, Shield.)*

### 4.7 Aliens (computer-controlled enemies)

Aliens are NPCs that the server simulates in the same tick loop as players. **Touching an alien is deadly**, so they act as moving hazards that shape the fight. Killing them **always** drops a collectible, which rewards players who hunt them.

#### 4.7.1 Alien types

| Type | Look | HP | Speed (per tile) | Behavior | Drops |
|---|---|---|---|---|---|
| **Drifter** | Green blob | 1 | 0.30 s [18 ticks] | Wanders. Keeps going in its current direction and picks a random open direction at intersections or when blocked, with a 25 % chance to turn at an intersection anyway. Does not avoid fire. | 1 |
| **Seeker** | Purple eye | 1 | 0.233 s [14 ticks] | **Hunts.** If a living player is within **7 tiles** of path distance, it moves toward the nearest one by BFS shortest path, recomputed every 0.5 s. Otherwise it wanders like a Drifter. It **avoids** active fire tiles and the blast lines of bombs with less than 1 s of fuse left. | 1 |
| **Brute** | Red armored | 3 | 0.35 s [21 ticks] | Hunts like a Seeker within **5 tiles** but does not avoid danger. After each hit it is invulnerable for 1 s [60 ticks] and blinks. | **2** |

- Every alien is **slower than a player** (player: 9 ticks per tile). Because contact is lethal, a player can always outrun an alien in an open corridor.
- **The Behavior column is provisional.** How aliens move will be decided by playtests. Candidates range from pure random walking, over the pursuit described above, to aliens that play like a player (going for collectibles, cutting off escape routes). Look, HP, speed and drops are fixed; the movement logic is not.
- Because of that, alien movement is built as **interchangeable behaviors** (a strategy per alien, [Server & Network §3.2](./SERVER-AND-NETWORK.md#32-the-simulation-package-internalgame)): each behavior only answers "which direction next?", and everything else (contact kill, damage, drops, spawning) is the same for all of them. A new behavior can be added, or assigned to an alien type, without touching the rest of the simulation.

#### 4.7.2 Interaction rules

- **Contact = instant kill.** A player is **eliminated immediately** (cause `alien`) when:
  - the player and an alien **occupy the same tile**, or
  - they **swap tiles** in the same tick, which prevents passing through each other.

  HP and invulnerability do **not** protect against this.
- **Telegraphing** (required, because contact is lethal):
  - If a behavior hunts players, the alien changes appearance while it does, e.g. its eye turns red (see GUI Plan). There is no line or marker pointing from an alien to its target.
  - A spawn portal glows for 1.5 s before an alien appears, and portal tiles are harmless.
- Aliens are blocked by hard walls, soft walls and bombs. They **cannot** place bombs or destroy walls.
- Aliens do not block or harm each other, and they may overlap.
- Aliens are hurt by fire from any bomb (1 damage per blast). Sudden-death walls crush them.
- Aliens **never pick up** collectibles.
- **Kill credit** for an alien goes to the owner of the fire (§4.5). A player killed by an alien gives **no** player any kill credit.
- **Guaranteed drop:** when an alien dies, it drops its collectible(s) on its occupied tile once the fire there has ended. A Brute's second item goes on the nearest empty tile, found by BFS. If there is no free tile within 3 steps, the second item is skipped.

#### 4.7.3 Spawning

- Arena settings: **aliens on/off** (default on) and **max aliens** from 0 to 8 (default by arena size: 2 / 3 / 4, §4.1). Ranked arenas always use the default for Small, which is 2 (§5.4.2).
- **At round start:** `max aliens` aliens spawn on random empty tiles that are at least **6 tiles (Manhattan distance)** away from every player spawn. If there are not enough empty tiles, the generator clears soft walls to make room.
- **Respawn:** every **30 s** [1800 ticks], if fewer than `max aliens` are alive, one new alien spawns on a random empty tile at least **5 tiles from every living player**.
- **Spawn warning:** a portal glows on the spawn tile for 1.5 s [90 ticks] before the alien appears. During that time the tile is harmless and the alien cannot be hurt.
- **Type mix:** Drifter 50 %, Seeker 35 %, Brute 15 %.
- All alien choices use the round's **seeded PRNG**, so a round replays identically from its seed plus the recorded inputs.

### 4.8 Rounds & match lifecycle

#### 4.8.1 States

```
WAITING ─(≥2 players, all ready)─► READY_COUNTDOWN (15 s) ─► COUNTDOWN (3 s) ─► PLAYING
   ▲        ▲                          │ someone joins,                ▲               │ (≤1 alive or time over)
   │        └──────────────────────────┘ un-readies or leaves          │ match open    ▼
   │                                                                   │ (Ranked only)
   └──── MATCH_END (12 s) ◄──────────── match decided ──────────── ROUND_END (5 s) ────┘
                  ▲                                                                    │
                  └──────────────── Unrated: round over, skip ROUND_END ───────────────┘
```

- **WAITING:** between matches. Players can join, leave and ready up, and the host can change settings (Unrated only).
- **READY_COUNTDOWN** (15 s): starts as soon as at least 2 players are in and **all** of them are Ready (§5.2). It is the last chance for more players to join, and it pauses whenever someone is not ready.
- **COUNTDOWN → PLAYING:** one round. A new random map is generated for every round.
- **ROUND_END** (5 s, **Ranked only**): shows the round winner and the series score. If the match is still open, the next round's COUNTDOWN starts automatically; otherwise MATCH_END follows.
- **Unrated** has a single round, so PLAYING goes **straight to MATCH_END** and there is no ROUND_END state. The server still sends `round.end` (with `matchDecided: true`) right before `match.end`, so clients handle both modes the same way.
- **MATCH_END** (12 s): shows the final standings and rating changes, then the arena goes back to WAITING. Players stay unless they leave.
- A ranked best-of-3 lasts at most about **10 min**: 3 × (3 s + 3 min + 5 s) + 12 s. An unrated match lasts at most about **3.5 min**.

#### 4.8.2 A round

- **Players per arena:** **Ranked: exactly 2.** **Unrated: 2–4.** Bigger arenas are out of scope for now.
- **Time limit:** 3 min.
- **Sudden death** starts at **2:00**:
  - Hard walls start filling the arena in a spiral from the border inward. The speed depends on the arena size (§4.1) so that every size loses the same share of its area: one tile every 0.5 s on Large (120 tiles by 3:00), 0.65 s on Medium (≈ 92 tiles), 0.75 s on Small (80 tiles).
  - A player under a falling wall is eliminated. An alien under one dies **without** dropping anything.
  - The HUD shows a sudden-death warning 10 s before it starts.
- **Round result** (aliens do not count; they cannot win):
  - The last player alive **wins the round**.
  - **Time-out (3:00) with more than one player alive:** survivors are compared by **remaining HP**, and **the player with less HP loses**. The survivor with the most HP wins the round. If several survivors are tied on the highest HP, the round is a **draw** between them.
  - If every remaining player dies on the same tick, whether from bombs, aliens or walls, the round is a **draw**.
- **Round placement:**
  - Survivors at time-out rank above all eliminated players, ordered by **HP (more is better)**. Survivors with equal HP **share** a placement.
  - Eliminated players are ordered by elimination tick. A **later elimination ranks higher**.
  - Players eliminated on the same tick **share** a placement.
- **Round points:** 1st place = **3**, 2nd = **2**, 3rd = **1**, 4th = **0**. Players who share a placement all get the points of that placement, so two players sharing 1st both get 3.

#### 4.8.3 The match

| Rule | Ranked (1-vs-1) | Unrated (2–4 players) |
|---|---|---|
| Format | **Best-of-3**, fixed | **Single round** (Bo1), fixed |
| Win the match | Be the first to **2 round wins** | Win the round |
| Maximum rounds | **3**. Drawn rounds count as played but give nobody a round win. | 1 |
| Match ends when | Someone reaches 2 round wins, **or** 3 rounds have been played, **or** a player forfeits | After the round, **or** when fewer than 2 players are still in |

Why the split: with 3–4 players, a series of rounds can end with everyone holding one win, and then the winner is picked by tiebreaks nobody follows. One round is simple and readable. A duel has no such problem, and best-of-3 there removes the luck of a single round, which matters when rating is at stake.

**Unrated placement** is simply the round placement (§4.8.2).

**Ranked placement** (used for the final result and for ELO). The two players are compared by:

1. **Round wins**, more is better.
2. **Total round points**, more is better.
3. **Placement in the last round played**, better is better.
4. If still equal, the match is a **draw**.

Tiebreaks 2–3 only matter when drawn rounds leave the score level, e.g. 1–1 after one drawn round.

**Example:** A wins round 1, round 2 is a draw, B wins round 3. That is 1–1 in wins and 8–8 in points (A: 3 + 3 + 2, B: 2 + 3 + 3), so the last round decides it: **B wins the match**.

#### 4.8.4 Joining, leaving and disconnecting

- **The roster is locked** when the first round's COUNTDOWN starts. Players who join an arena in the middle of a match **spectate** and play in the next match.
- **Disconnect during PLAYING:** the character stays in game (idle) for **15 s**, waiting for a reconnect. An idle character can still be killed. After 15 s the player is eliminated, and their elimination tick is the moment the grace period ran out.
- **Disconnect between rounds:** a player who is not back by the end of the next COUNTDOWN is eliminated at tick 0 of that round, which puts them last. They can rejoin in later rounds of the same match.
- **Leaving voluntarily** (ESC → Leave) is a **forfeit**:
  - The player is eliminated immediately, at the current tick.
  - **Ranked:** the forfeiter **loses the match** right away (§4.8.3), whatever the round score was, and the opponent wins it.
  - **Unrated:** the forfeiter ranks **below everyone who stayed**. Among several forfeiters, whoever left later ranks higher.
  - So rage-quitting never improves a result.
- If only **one** player who has not forfeited is left, the match ends immediately and that player wins it.

---

## 5. Arenas, Lobby & Ranking

### 5.1 Lobby

- Shows the list of arenas with: name, **Ranked 1v1 / Unrated** badge, status (Waiting / Starting in 0:12 / **Round 2 of 3, score 1–0** / Playing / Match end), players (`n/2` ranked, `n/4` unrated), the **waiting opponent's rating** (ranked arenas), whether it is private, whether aliens are on, **region and measured ping**.
- Actions:
  - **Quick Play:**
    - **Registered users** join a **ranked** WAITING arena with one player waiting, in the **lowest-ping region**, preferring an opponent within ±200 rating. If none is available, it creates a new ranked arena and waits there.
    - **Guests** join an **unrated** WAITING public arena in the lowest-ping region, preferring the fullest one, or create one.
  - **Create Arena:**
    - Name, region (lowest ping preselected), private (yes/no).
    - **Game mode:** **Ranked** or **Unrated**.
    - **Ranked:** always 2 players on a Small arena, public and the locked standard rules (§5.4.2). Not offered to guests.
    - **Unrated:** max players (2–4), **arena size** (Small 15 / Medium 17 / Large 21, defaulting to the max players, §4.1), soft wall density, wall drop rate, aliens on/off, max aliens. Always a single round.
  - **Join**: by clicking an arena in the list, or by entering a **6-character invite code** for a private arena. Guests clicking a Ranked arena get a "Register to play Ranked" prompt.
- The list refreshes live over the socket.

### 5.2 Arena rules

- The creator is the **host**. The host can change settings (Unrated) and kick players, but **cannot start the match by hand**. In ranked arenas a kick only takes effect between matches. If the host leaves, the host role passes to the player who joined next earliest.
- **Starting a match: the 15 s ready countdown.**
  - Every player in the waiting room has a **Ready** toggle.
  - When at least **2 players** are in and **all** of them are Ready, a **15 s countdown** starts (READY_COUNTDOWN, §4.8.1), visible to everyone in the room and as "Starting in 0:12" in the lobby list.
  - The arena stays open during the countdown, so a 3rd or 4th player can still join an unrated arena.
  - **A new player joins** → the countdown **pauses**. The newcomer starts as *Not ready*. When they press Ready, the countdown **restarts from 15 s**.
  - **A player un-readies** → the countdown pauses until they are Ready again, then restarts from 15 s.
  - **A player leaves** → if at least 2 players remain and all are Ready, the countdown restarts from 15 s; otherwise it is cancelled.
  - The host changing a setting un-readies everyone, so nobody starts a match with rules they did not see.
  - When the countdown reaches 0, the roster is locked and the round's 3 s COUNTDOWN begins.
  - **Ranked:** the same rule with 2 slots. Once both players are Ready, the 15 s countdown runs, and nobody else can join a full ranked arena.
  - Restarting from 15 s every time could stall a room if people keep joining. This is accepted: the room is capped at 4 players, so at most 2 restarts can come from new joiners.
- An arena with no players for 60 s is destroyed.
- A player can be in **only one arena at a time**. Opening a second tab replaces the first connection.

### 5.3 Capacity targets (v1)

- ≥ 200 concurrent arenas (≈ 800 players + 1,600 aliens) per game-server instance with 2 vCPU.

### 5.4 Ranked play & ELO rating

#### 5.4.1 Rating basics

| Parameter | Value |
|---|---|
| Starting rating | **1200** |
| Rating floor | 100 |
| Provisional period | First **15** rated matches: K = **40** |
| Established | K = **24** |
| High rating (≥ 1800) | K = **16** |
| Leaderboard eligibility | ≥ **10** rated matches. Before that, the player shows as "Placement n/10". |
| Storage | Integer rating. Deltas are rounded half away from zero. |
| Unit | **One rating update per ranked match** (the whole best-of-3), never per round |
| Who is rated | Only **Ranked 1-vs-1** matches. Unrated matches, whatever the player count, never change rating. |
| Seasons | **None in v1.** The rating is permanent, and there are no resets or decay. |

#### 5.4.2 When is a match rated?

A match is **rated** only if **all** of these hold:

1. The arena is **public** and in **Ranked** mode. Private arenas can only be Unrated, which stops friends from boosting each other.
2. The arena uses the **standard ruleset**, which is locked in Ranked mode: 2 players, best-of-3, Small 15×15 arena, 65 % walls, 30 % wall drops, aliens on, max 2 aliens.
3. **Both** players on the roster are registered. Guests cannot join Ranked arenas (§3.4), so this always holds; the rating worker still checks it.
4. The match reached a result (§4.8.3). A match that ended early because the opponent forfeited **is** rated, and the forfeiter loses.
5. The match finished normally. If a server crashes mid-match, the whole match, including rounds already played, is not rated (see [Events §9](./EVENTS-AND-MESSAGING.md#9-failure-scenarios)).

#### 5.4.3 Two-player ELO

Standard ELO for player *A* against opponent *B*, scored by the **match** result (§4.8.3), not by individual rounds:

```
E_A  = 1 / (1 + 10^((R_B − R_A) / 400))     expected score of A
S_A  = 1    A won the match
       0.5  draw
       0    A lost (including by forfeit)
Δ_A  = round( K_A × (S_A − E_A) )
R_A' = max(100, R_A + Δ_A)
```

- **How a player died does not matter.** A death to a bomb, an alien or a wall all count the same. Kills and alien kills do **not** change the rating directly; they only appear in stats.
- **Forfeiting** is a loss, so rage-quitting is never better than playing on.
- Each player uses their **own K**. Two players with different K values do not move by the same amount, so the sum of both deltas is not always zero. This is standard and accepted.

**Example:** A (1200, K = 24) beats B (1300, K = 40, provisional).

```
E_A = 1 / (1 + 10^(100/400)) = 0.36      E_B = 0.64
Δ_A = round(24 × (1 − 0.36)) = +15  →  1215
Δ_B = round(40 × (0 − 0.64)) = −26  →  1274
```

#### 5.4.4 Tiers (display only)

| Tier | Rating |
|---|---|
| Bronze | < 1100 |
| Silver | 1100–1299 |
| Gold | 1300–1499 |
| Platinum | 1500–1699 |
| Diamond | ≥ 1700 |

#### 5.4.5 Processing

- Ratings are calculated **asynchronously** by the **rating worker**, from the durable `match.finished` domain event (see [Events & Messaging](./EVENTS-AND-MESSAGING.md)).
- Processing is idempotent, so a duplicate delivery never applies a rating change twice.
- The game server publishes **one** `match.finished` event per match (ranked best-of-3 or unrated single round), containing all of its rounds. The rating worker applies ELO only to rated ranked matches.
- The match-end screen shows "rating updating…" and then the delta, pushed to the client within ~1–2 s.
- *(v1.1)* Anti-farming: K is halved for a player's 6th+ match within 24 h against the same opponent.

---

## 6. System Architecture (summary)

v1 runs everything on **one Compute Engine VM** with Docker Compose (§8). Only Pub/Sub, Cloud Storage and the logging/tracing back ends are managed services.

```
 Browser
   │ HTTPS: SPA files, /api/auth/* (Gin), gRPC-Web            WSS /play (game)
   ▼                                                            │
┌──────────────────────── GCE VM (europe-west3), docker compose ┼──────────────────────┐
│ ┌──────────────────────────────┐                              │                      │
│ │ Caddy: TLS, static Vue SPA,  │──────────────────────────────┘                      │
│ │ routing                      │──── gRPC-Web ───► Envoy ── gRPC ──┐                  │
│ └──────┬───────────────────────┘                                   ▼                  │
│        │ HTTP (Gin)                ┌───────────────────────────────────┐              │
│        └──────────────────────────►│ API service (Go): Gin + gRPC      │              │
│                                    │ auth, profiles, leaderboard       │              │
│                                    └──────────────┬────────────────────┘              │
│ ┌──────────────────────────────┐                  │                                   │
│ │ Game server (Go)             │                  │                                   │
│ │ lobby, arenas, tick loops    │◄── LISTEN rating_updated ──┐                          │
│ └──────┬───────────────────────┘                  ▼         │                          │
│        │ publish match.finished        ┌──────────────────────┐                        │
│        │                               │ PostgreSQL 17        │                        │
│        │      ┌──────────────────┐     └──────────▲───────────┘                        │
│        │      │ Rating worker    │────────────────┘                                    │
│        │      │ (Go, pull)       │                                                     │
│        │      └────────▲─────────┘     OTel Collector · Prometheus · Grafana           │
└────────┼───────────────┼─────────────────────────────────────────────────────────────┘
         ▼               │ pull
     ┌─────────────────────────┐        Cloud Trace · Cloud Logging · Sentry (errors)
     │ Cloud Pub/Sub           │
     │ match-events (+ DLQ)    │
     └─────────────────────────┘
```

| Part | Summary | Details |
|---|---|---|
| **Backend** | **Go 1.25+**. A stateless **API service** (Gin for HTTP, gRPC for the data APIs), a stateful **game server** (one goroutine per arena, **60 Hz** simulation, **30 Hz** snapshots) and a **rating worker** that consumes domain events. | [Server & Network §3](./SERVER-AND-NETWORK.md#3-game-server-internals), [Backend Architecture](./BACKEND-ARCHITECTURE.md) |
| **Events** | In-game events go over the socket in real time and never through a queue. **Pub/Sub** carries durable domain events (`match.finished`). Postgres `LISTEN/NOTIFY` delivers rating-update notifications. | [Events & Messaging](./EVENTS-AND-MESSAGING.md) |
| **Network** | **Binary protocol** over WebSocket in v1. WebTransport datagrams are planned for v2. The client predicts its own movement and bombs, and draws other entities from an interpolation buffer. v1 serves one region; v2 routes players to the nearest one. | [Server & Network §4–§7](./SERVER-AND-NETWORK.md#4-transport) |
| **Database** | **PostgreSQL 17** in a container on the VM's persistent disk (v1), Cloud SQL in v2 | §7 |
| **Frontend** | **Vue 3 + TypeScript + Vite + Pinia + Vue Router + Tailwind**. Vue handles the menus and HUD. A non-reactive game engine draws the game on a Canvas 2D at 60 FPS. Data calls use generated **gRPC-Web** clients. | [GUI Plan](./GUI-PLAN.md) |
| **Operations** | **GitHub Actions** CI/CD, **OpenTelemetry** traces, **Prometheus + Grafana** metrics, **Sentry** errors | [CI/CD](./CI-CD.md) |

### 6.1 API (API service)

The API has two faces:

- **HTTP via Gin**, for the few endpoints that need browser-native HTTP: the auth endpoints set and read the `HttpOnly` refresh cookie, and health checks and the ping endpoint must be plain HTTP.
- **gRPC services** for all data APIs. They are defined in `/protocol/api/bomberman/v1/*.proto` and managed with **buf** (lint, breaking-change check, code generation for Go and TypeScript). The browser calls them with **gRPC-Web**, and **Envoy** translates gRPC-Web to gRPC.

**HTTP (Gin):**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | – | Create account → access token + refresh cookie |
| POST | `/api/auth/login` | – | Login → access token + refresh cookie |
| POST | `/api/auth/guest` | – | `{nickname?}` → guest token |
| POST | `/api/auth/refresh` | cookie | New access token (rotates the refresh cookie) |
| POST | `/api/auth/logout` | user | Revoke refresh token |
| HEAD | `/ping` | – | Latency probe for region selection |
| GET | `/healthz`, `/readyz` | – | Health checks |
| GET | `/metrics` | internal only | Prometheus scrape endpoint, not routed by Caddy |

**gRPC (package `bomberman.v1`, JWT in the `authorization` metadata):**

| Service | RPC | Auth | Purpose |
|---|---|---|---|
| `AccountService` | `GetMe` | user/guest | Current identity + rating (users) |
| `RegionService` | `ListRegions` | – | Game regions + ping and socket URLs |
| `LeaderboardService` | `ListLeaderboard(offset, limit)` | – | Top players by rating (eligible only) |
| `ProfileService` | `GetProfile(username)` | – | Public profile, stats, rating, tier, rank |
| | `ListMatches(username, cursor, limit)` | – | Paginated match history (with rating deltas) |
| | `GetRatingHistory(username)` | – | Rating over time (for the chart) |

Domain errors map to gRPC status codes (`NotFound`, `InvalidArgument`, `AlreadyExists`, `Unauthenticated`), not HTTP statuses. The real-time messages are specified in [Server & Network §5](./SERVER-AND-NETWORK.md#5-binary-protocol); they stay on the WebSocket, because gRPC is not suited to 60 Hz game traffic in the browser.

### 6.2 Technology rationale

**Decision:** Go game server and API, plus a Vue/TypeScript client. The client contains a **small TypeScript port of only the rules it predicts**, verified against test vectors generated by the Go simulation (option A below).

**Why Go fits this game:**

- The server only runs game rules: a grid of at most 21×21, ≤ 4 players, a few aliens, tile-by-tile integer movement. No engine, physics or rendering is needed on the server.
- The workload is many small concurrent arenas and many WebSocket connections. One goroutine per arena plus two per connection is cheap, and the language handles this well.
- Garbage collection pauses are typically well under 1 ms. The simulation makes 0 allocations per tick ([Server & Network §3.2](./SERVER-AND-NETWORK.md#32-the-simulation-package-internalgame)), and one tick is 16.7 ms, so GC is far below network jitter.
- Small static binaries make small container images, and one language covers the API, game server, worker and bots.
- Go is proven for game backends: Nakama and Agones are both written in Go.

**The real cost, and how it is handled:** client-side prediction needs part of the rules in the browser, so that part exists in two languages. The options:

| Option | Shared rules | Verdict |
|---|---|---|
| **A. Go server + TS port of the predicted rules + generated test vectors** | Kept in sync by CI | **Chosen.** Tile-by-tile movement keeps the port to roughly 300 lines. Explosions, damage, pickups and aliens are never predicted. |
| B. Compile `internal/game` to WebAssembly for the client | One codebase | Rejected for v1: adds roughly 0.5–1 MB gzipped (less with TinyGo) and JS↔WASM friction, for a port that is small anyway. It stays possible later because the simulation is pure. |
| C. TypeScript/Node server with **Colyseus** | Native | Rejected. Its main gains are room handling and delta state sync. We need room logic of our own anyway (best-of-3, ranked rules), and full snapshots are only about 120 B, so delta sync saves almost nothing. Colyseus also does not provide prediction or interpolation, which we would write either way. |
| D. **Nakama** (Go game backend with authoritative matches, auth, leaderboards) | Go match handlers | Rejected for v1: it replaces our own accounts, ELO and schema design with its model. The open-source edition runs as a single node (clustering is commercial), and Go plugins must be built against the exact Nakama version. Worth revisiting only if the custom networking becomes a burden. |
| E. Rust | WASM-shareable | Rejected: much higher effort for no benefit at this scale. |

**Networking effort:** we write the networking ourselves, on top of `coder/websocket`. The parts and their rough size are listed in [Server & Network §3.6](./SERVER-AND-NETWORK.md#36-networking-code-build-vs-buy).

---

## 7. Data Model (PostgreSQL)

- **Engine:** **PostgreSQL 17**. In v1 it is the `postgres:17` container on the VM, with its data on a separate persistent disk, a nightly `pg_dump` to Cloud Storage and daily disk snapshots ([CI-CD §6.3](./CI-CD.md#63-backups)). In v2 it moves to Cloud SQL (HA, point-in-time recovery).
- **Access:** `pgxpool` over the internal Docker network. Each service logs in with its own role and password (from Secret Manager), so table ownership is enforced by the database ([DATABASE §7](./DATABASE.md#7-roles-and-privileges)).
- **Extensions:** `citext`.
- **IDs:** **UUIDv7**, generated in the application. They sort by time, which keeps the indexes compact.
- **Migrations:** **Goose** SQL files, applied by the one-shot `migrate` container before each deploy.
- **Timeouts:** `statement_timeout = 5s` for API connections.

The full schema (every table, column, constraint, foreign key and index, plus the Go type mapping and migration plan) is in **[DATABASE.md](./DATABASE.md)**, which is the source of truth. Summary:

| Group | Tables |
|---|---|
| Accounts | `users`, with 1:1 components `user_credentials`, `player_ratings`, `user_stats`; `refresh_tokens` (rotation families) |
| Match aggregate | `matches` → `match_players` (per slot), `match_rounds` (per round), `match_round_players` (per round × slot) |
| Rating | `rating_history` (one row per rated player per rated match) |
| Messaging | `processed_events` (consumer inbox), `outbox` (API producer) |

- **Leaderboard rank** = `1 + count(*) of eligible players with a higher rating`. This query uses the partial index. Pages of the top 100 are cached in memory for 30 s.
- A self-kill is not counted as a kill.
- Arena state is **in-memory only**. The database only receives finished matches, through the event pipeline. The game server **never** writes to PostgreSQL directly.
- **Housekeeping:**
  - `processed_events` rows older than 30 days are deleted daily. Pub/Sub only redelivers within 7 days.
  - `outbox` rows that were published more than 7 days ago are deleted.

---

## 8. Deployment (summary)

**v1 is a single server.** One Compute Engine VM runs the whole stack with Docker Compose. That keeps cost, moving parts and operations small while the game finds players. Scaling out (GKE + Helm, Cloud SQL, Redis, several regions) is the v2 step and needs no game-code changes, because transport, publisher and store sit behind interfaces.

| Concern | v1 (one VM) | v2 (scale-out) |
|---|---|---|
| Host | **Compute Engine VM** `e2-standard-4` in `europe-west3`, Docker Compose | **GKE** with **Helm** charts, 2–3 regions |
| Ingress / TLS | **Caddy** container (Let's Encrypt, HTTP/2 + HTTP/3), also serves the Vue SPA | GKE Gateway + managed certs + Cloud Armor; passthrough Network LB for game traffic and WebTransport |
| gRPC-Web | **Envoy** container | Envoy (sidecar or gateway) |
| API service | One container (Gin + gRPC) | Deployment, autoscaled |
| Game server | One container, arenas in memory | Game pods per region + gateway (Server & Network §8.2) |
| Rating worker | One container, Pub/Sub **pull** subscription | Deployment, same code |
| Message queue | **Cloud Pub/Sub**: topic `match-events` + `match-events-dlq`. `user-events` is added in v1.1. | Same |
| Analytics (optional) | Pub/Sub → **BigQuery subscription** on `match-events` | Same |
| Database | **PostgreSQL 17** container, nightly `pg_dump` → Cloud Storage, disk snapshots | **Cloud SQL for PostgreSQL 17** (HA, PITR) |
| Arena directory / lobby pub/sub | In-process | **Memorystore for Redis** |
| Secrets | **Secret Manager**, fetched into a root-only `.env` at deploy time | Secret Manager via the CSI driver / Workload Identity |
| Images / CI/CD | **GitHub Actions** (CI, release, approval via the `production` environment), **Artifact Registry**. See [CI-CD.md](./CI-CD.md). | GitHub Actions + `helm upgrade` |
| Observability | **OpenTelemetry** → Cloud Trace, **Prometheus + Grafana** on the VM, **Sentry**, Cloud Logging (Ops Agent), external uptime check | Managed Service for Prometheus, Cloud Monitoring |
| Infra as code | None: a short `gcloud` runbook ([CI-CD §8](./CI-CD.md#8-bootstrap-steps-one-time)) | Revisited when there are several environments |
| Environments | `local` (Docker Compose with Postgres + **Pub/Sub emulator**) and `prod` | + `staging` |

The topology, why it was chosen for latency, and the scaling path are covered in [Server & Network §8](./SERVER-AND-NETWORK.md#8-deployment-topology--scaling) and [CI-CD §9](./CI-CD.md#9-path-to-v2-scaling-up).

### 8.1 Regions (EU only)

| Role | Region |
|---|---|
| **Primary** (v1: everything) | **`europe-west3` (Frankfurt)**: central to the EU player base. Hosts the VM (and with it the API, game server, worker and database), Artifact Registry and the Pub/Sub regional endpoint. |
| v2 extra game regions | **`europe-west1` (Belgium)** for West/UK/Iberia and **`europe-central2` (Warsaw)** for Central/East. `europe-north1` (Finland) can be added for the Nordics if latency data supports it. |
| v2 Cloud SQL HA standby | Same region (zonal failover). A cross-region read replica / DR copy goes in `europe-west1`. |

- **Data residency (GDPR):**
  - Pub/Sub **message storage policy** is restricted to EU regions.
  - The BigQuery dataset location is `EU`.
  - Cloud Storage buckets (backups, replays) are `EU` / `europe-west3`, and disk snapshots use an EU storage location.
  - Sentry is configured with its **EU data region**.
  - The project has no organization in v1, so the `gcp.resourceLocations` org policy can't be set. Every resource is created with an explicit EU location by the runbook ([CI-CD §8](./CI-CD.md#8-bootstrap-steps-one-time)). The org policy is added if the project moves into an organization.
- **Expected latency:** with Premium Tier, players across the EU typically see about **10–40 ms** RTT to Frankfurt. v2 regions mainly add capacity and resilience and shave the edges, such as the Iberian peninsula and the Baltics.

---

## 9. Security & Fair Play

- **The server is authoritative:** clients send intents only. All movement, collisions, bombs, aliens, damage and pickups are computed on the server. Client-side prediction is cosmetic, and the server corrects it.
- **Ratings cannot be tampered with:**
  - Clients never submit results. Only the game server publishes to `match-events`, and the topic is not reachable with any credential a client has.
  - Only the rating worker's **database role** may write ratings ([DATABASE §7](./DATABASE.md#7-roles-and-privileges)).
  - In v1 all containers share the VM's service account, so the publish restriction is enforced by code and network layout, not IAM. v2 gives each service its own identity (GKE Workload Identity), and then only the game server's service account may publish.
- The JWT is validated when the game socket connects. The `Origin` header is checked against an allow-list.
- Input validation and rate limits apply to REST and to the game socket (at most 90 binary messages/s: 60 commands plus pings). The server consumes exactly one command per player per tick, which makes speed hacks impossible.
- Usernames and nicknames go through a profanity filter.
- Only HTTPS/WSS is used. Security headers (CSP, HSTS) are set, and CORS (Caddy and Envoy) is restricted to the frontend origin.
- Rate limiting happens in the application in v1 (per IP and per account). Cloud Armor at the load balancer comes with v2.
- The VM exposes only ports 80 and 443. SSH goes through IAP, and Postgres, Prometheus and the internal gRPC/HTTP ports are never published.
- Passwords are never logged, and PII stays out of logs and events. Events carry user IDs and display names only, never emails.

---

## 10. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Latency | Your own move and bomb show on screen within **one frame** (prediction). Other entities are shown **≈ RTT/2 + 50–80 ms** behind the server. Explosions and other world events appear **≈ RTT/2 + 1 tick** after they happen on the server. In-region RTT target: p50 ≤ 40 ms. Server tick ≤ 1 ms per arena at p99. Full budget: [Server & Network §2](./SERVER-AND-NETWORK.md#2-latency-budget). |
| Durability | Once a match result is published, it is **never lost**. It survives game server restarts and database outages of up to 7 days (Pub/Sub retention). Accounts and profiles have an RPO of 24 h in v1 (nightly backup + disk snapshots). |
| Rating correctness | Each rating change is applied **exactly once** (at-least-once delivery + idempotent consumer). p95 time from match end to rating visible ≤ 3 s. |
| Performance | The client renders at 60 FPS on a mid-range laptop. Bundle size ≤ 300 KB gzipped (without assets). |
| Availability | 99 % monthly (v1, one VM: a VM or zone failure takes the whole game down until the VM restarts or is rebuilt from a snapshot). 99.5 % in v2. The game keeps running when the database is down; only ratings and profiles are delayed. |
| Scalability | ≥ 200 concurrent arenas per 2 vCPU instance. |
| Browser support | Latest 2 versions of Chrome, Firefox, Edge and Safari. |
| Observability | Metrics (Prometheus, through OpenTelemetry instrumentation): active arenas/players/aliens, tick duration and jitter, RTT per region, send queue depth, reconnects, Pub/Sub publish latency and oldest unacked message age, DLQ size, rating processing lag. Traces with OpenTelemetry. Errors in Sentry. Structured JSON logs (`log/slog`). |
| Testing | Go tests use the standard `testing` package with **testify** (`require`/`assert`) and **mockery**-generated mocks for service interfaces. Unit tests for `internal/game` (map gen invariants, blast propagation, chain reactions, pickups and caps, damage/invulnerability, alien AI, instant alien kill, drops, determinism) and `internal/rating` (ELO math, ties, guests, K-factors, eligibility). Idempotency tests for the consumer (duplicate and out-of-order delivery). Shared protocol test vectors for Go and TS. Playwright E2E with 2 clients under simulated latency. |
| Accessibility | Colorblind-safe player colors with name labels, remappable keys (see [GUI Plan](./GUI-PLAN.md#11-accessibility--i18n)). |

---

## 11. Acceptance Criteria (v1)

1. A visitor can register, log in, log out, or start as a guest in ≤ 2 clicks.
2. The lobby lists arenas live with region, ping, Ranked/Unrated badge and match progress. A player can quick-play, create (public/private, Ranked/Unrated) and join by code.
3. Every generated map has the arena's size (15×15, 17×17 or 21×21; always 15×15 in Ranked), has hard walls on the border and on every (even, even) tile, has soft walls only on other tiles, and has the spawn safe zones clear. Two players start in opposite corners.
4. SPACE places a bomb that explodes after 3 s in a + shape limited by range. Fire stops at hard walls, destroys the first soft wall it hits in each direction, and sets off other bombs.
5. A player starts with 1 bomb. Each **+Bomb** collectible lets them have one more bomb on the field at the same time, up to 8.
6. Destroyed soft walls sometimes drop +Health, +Fire or +Bomb, and the caps are enforced.
7. Aliens of all 3 types spawn away from players, move according to their behavior, **kill a player instantly on contact** (including tile swaps, regardless of HP or invulnerability), take damage from fire, respawn every 30 s up to the cap, and **always** drop collectibles when killed (Brute: 2).
8. A bomb hit removes 1 HP followed by 1.5 s of fire invulnerability, and 0 HP eliminates the player.
9. The last player alive wins the round. Sudden death starts at 2:00. At the 3:00 time-out, the survivor with the most HP wins, and a tie on the highest HP is a draw. Simultaneous final deaths produce a drawn round. Round placement follows HP for survivors, then elimination order.
10. A ranked match is a 1-vs-1 best-of-3: the first player to 2 round wins takes it, with at most 3 rounds. Every round has a new map and reset power-ups. Ties are broken by round points, then the last round. A forfeit is a loss. An unrated match (2–4 players) is a single round, and its placement is the round placement.
    - A match starts only through the waiting room's 15 s all-ready countdown. A player joining during it pauses it, and it restarts from 15 s when they are Ready. Guests cannot join Ranked arenas.
    - On a touch device, a virtual joystick (4 directions) and a bomb button control the player, with the same result as the keyboard.
11. Several arenas run at the same time without interfering with each other.
12. With 100 ms of simulated RTT, your own movement and bomb placement still appear instantly, and remote players move smoothly without jitter.
13. After a rated ranked match, both players' ratings change **once** according to §5.4. The delta appears on the match-end screen within 3 s, and on the profile and leaderboard. Unrated matches and private arenas are never rated. There are no seasons or resets.
14. If the same `match.finished` event is delivered twice, the rating changes only once. If the database is down at match end, the rating is applied after it recovers.
15. Registered users' matches (with per-round detail) show up in their profile. Guests' results do not.
16. The app is deployed to the v1 VM by GitHub Actions from `main`, after a manual approval.

---

## 12. Milestones

| # | Milestone | Content |
|---|---|---|
| M1 | **Core simulation** | `internal/game`: map gen, movement, bombs, fire, collectibles (incl. +Bomb), round result & placement, **match logic** (ranked best-of-3 with round points, tiebreaks and forfeits; unrated single round), determinism tests |
| M2 | **Aliens** | Alien types, AI (wander/BFS hunt/danger avoidance), instant contact kill, spawning, guaranteed drops, tests |
| M3 | **Netcode** | Binary protocol + codecs (Go/TS) with shared test vectors, event sequencing and replay, WS gateway, arena tick loop, prediction and interpolation, latency simulator |
| M4 | **GUI** | Vue app shell, canvas renderer, HUD, touch controls, lobby, waiting room, results ([GUI Plan](./GUI-PLAN.md)) |
| M5 | **Accounts & data** | Register/login/guest (Gin), JWT/refresh, PostgreSQL schema & Goose migrations, gRPC services (buf) + Envoy gRPC-Web for profiles & stats |
| M6 | **Events & ranking** | Pub/Sub topics + DLQs, match publisher with local spool, rating worker (pull, inbox, ELO), `LISTEN/NOTIFY` push, leaderboard, outbox table (relay enabled in v1.1) |
| M7 | **v1 deployment** | GitHub Actions CI/CD, Artifact Registry, the VM + Docker Compose stack (Caddy, Envoy, Postgres), backups, OpenTelemetry + Prometheus/Grafana + Sentry, alerts |
| M8 | **Polish** | Sprites, animations, sound, sudden death, settings, accessibility |
| v2 | **Scale & latency** | GKE + Helm, Cloud SQL, multi-region game pods, Redis directory, WebTransport datagrams |
| v1.1+ | Extras | Phantom alien, +Speed/Kick, lobby chat, email verify/reset, anti-farming, ranked matchmaking queue |
| Later | Not in v1 | Rating seasons / resets, co-op / PvE modes |

---

## 13. Open Questions

Defaults are proposed above. Please confirm or change them:

**Resolved:**

- Match format: **Ranked is 1-vs-1 best-of-3**, **Unrated is a single round** (v0.8).
- There are **no seasons** in v1.
- There are two game modes: **Ranked** and **Unrated**. Only registered players can play Ranked (v0.8).
- Ranked opponents are found through ranked arenas in the lobby (and Quick Play), not a matchmaking queue (v0.8).
- Matches start with a 15 s all-ready countdown; there is no host Start button (v0.8).
- Touch controls are in v1: a virtual joystick and a bomb button (v0.8).

- Players start with **3 HP**, up to 5 with +Health.
- **2–4 players** per unrated arena, exactly 2 in ranked. No bigger arenas for now.
- **Sudden death** stays. At the 3:00 time-out **the player with less HP loses**.
- Movement is **tile-by-tile**.
- **EU regions only** (§8.1).
- **v1 is a single server** (one VM, Docker Compose), with no Terraform. CI/CD runs on **GitHub Actions** (§8).

**Still open:**

1. The domain, the deploy window and the VM size. See [CI/CD §10](./CI-CD.md#10-open-questions). (The license is decided: Business Source License 1.1, see `LICENSE`.)
