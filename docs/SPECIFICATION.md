# BomberMan Online: Multiplayer Specification

| | |
|---|---|
| **Version** | 0.6 (draft) |
| **Date** | 2026-11-01 |
| **Stack** | Go (backend / game server), Vue 3 (frontend), **PostgreSQL** (database), Google Cloud Platform (hosting) |

Related documents:

- [GUI Plan (Vue)](./GUI-PLAN.md): screens, components, rendering, input, UX.
- [Server & Network Design](./SERVER-AND-NETWORK.md): game server internals, binary protocol, latency minimization, deployment topology.
- [Events & Messaging](./EVENTS-AND-MESSAGING.md): event handling (in-game, notifications, domain events), the message queue decision, and the ELO pipeline.
- [CI/CD on GCP](./CI-CD.md): Cloud Build, Artifact Registry, Cloud Deploy, Terraform pipelines.

### Changelog

| Version | Changes |
|---|---|
| 0.6 | **Go confirmed** for the backend after reviewing the alternatives (§6.2). The game rules stay in Go. The client re-implements only what it predicts (own movement and bomb placement), and **shared test vectors generated from the Go simulation** keep the two in sync. The networking code we write ourselves is listed and sized in [Server & Network §3.6](./SERVER-AND-NETWORK.md#36-networking-code-build-vs-buy). |
| 0.5 | Confirmed 3 HP, 2–4 players and tile-by-tile movement. At the time-out, **the player with less HP loses** (§4.8.2). **EU-only regions** with EU data residency (§8.1). Added the **CI/CD on GCP** design ([CI-CD.md](./CI-CD.md)). |
| 0.4 | A **match is now best-of-3 rounds** (§4.8). ELO is applied once per match, from the match placement. There are two game modes, **Ranked** and **Unrated** ("casual" renamed). Permanent rating with **no seasons in v1**. Data model gains `match_rounds`. |
| 0.3 | **Touching an alien kills instantly.** Added **ranked play with ELO rating** (§5.4). Reworked event handling: three event classes, **Google Cloud Pub/Sub** for durable match results, outbox/inbox patterns, event sequence numbers and replay. PostgreSQL schema extended. Co-op mode removed from scope. |
| 0.2 | +Bomb collectible, aliens, 60 Hz simulation / 30 Hz snapshots, GUI and network design split into separate documents. |
| 0.1 | First draft. |

---

## 1. Overview

BomberMan Online is a browser-based, real-time multiplayer Bomberman game. Players can **register**, **log in**, or **play anonymously as a guest**. Many **battle arenas** run at the same time, and each one holds its own independent match. Inside an arena, players move around a 21×21 grid, place bombs with **SPACE**, blow up destructible walls, avoid and hunt deadly computer-controlled **aliens**, collect power-ups and try to be the last one standing. Each match is played as **best of 3 rounds**. Arenas run in one of two game modes:

- **Ranked:** registered players earn or lose **ELO rating**.
- **Unrated:** just for fun.

### 1.1 Goals

- Multiplayer in real time with **minimal perceived latency**. Your own movement and bombs react instantly, and other players appear within about 100 ms of real time in the same region (see [Server & Network](./SERVER-AND-NETWORK.md)).
- Many arenas running concurrently and isolated from each other.
- Getting into a game takes little effort: a guest can play within 2 clicks.
- The server is authoritative, so clients cannot cheat on positions, bombs or damage.
- A fair, tamper-resistant **ELO rating**, where match results are **never lost** even if the database is temporarily unavailable.
- Simple to deploy and run on GCP.

### 1.2 Non-goals (v1)

- **Co-op / PvE-only modes.** Aliens exist only inside PvP arenas.
- Mobile/touch controls (desktop keyboard only in v1).
- In-game chat (lobby chat is a v1.1 candidate).
- Strict skill-based matchmaking. Quick Play only *prefers* arenas with similar ratings (§5.1).
- Spectator mode for people outside the match (eliminated players still spectate their own match).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Arena** | A game room. It has its own map, players, aliens and match lifecycle. |
| **Round** | A single game: one map, from countdown to the last player standing (or a draw). |
| **Match** | A **best-of-3** series of rounds in an arena (configurable Bo1/Bo3/Bo5 in Unrated mode). ELO is applied per match. |
| **Tile** | One cell of the 21×21 grid. |
| **Hard wall** | An indestructible wall. |
| **Soft wall** | A destructible wall that is placed randomly and can be destroyed by fire. |
| **Fire / blast** | The cross-shaped explosion a bomb produces. |
| **Range** | How many tiles the fire reaches in each direction. |
| **Collectible** | A power-up item lying on a tile. A player picks it up by walking over it. |
| **Alien** | A computer-controlled enemy (NPC). Touching one kills a player instantly. |
| **Tick** | One step of the server simulation (60 Hz). |
| **Guest** | An anonymous player with no account. |
| **Game mode** | **Ranked** (standard rules locked, best-of-3, rated) or **Unrated** (custom rules allowed, never rated). Set per arena. |
| **Rated match** | A Ranked match that meets the eligibility rules and therefore changes ELO (§5.4.2). |
| **ELO** | A skill rating system. Everyone starts at 1200, and each rated match moves rating points between players. |
| **Game event** | A real-time fact that happened inside an arena (bomb exploded, wall destroyed…), sent to clients. |
| **Domain event** | A durable business fact (e.g. `match.finished`) published to the message queue for other services. |

---

## 3. User Roles & Accounts

### 3.1 Roles

| Role | Can do |
|---|---|
| **Guest** | Choose a nickname (or have one generated), browse arenas, join/create arenas, play (including in ranked arenas, but **unrated**). Stats are **not** persisted. |
| **Registered user** | Everything a guest can do, plus a persistent profile, match history, statistics, an **ELO rating**, a leaderboard position and a reserved username. |

### 3.2 Registration

- Fields: `username` (3–16 chars, `[A-Za-z0-9_]`, unique and case-insensitive), `email` (unique, valid format) and `password` (min. 8 chars).
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
- Guests have no rating and are **ignored by ELO calculations** (§5.4.3).

---

## 4. Game Rules

All durations below are given in seconds. The server counts them in **ticks at 60 Hz** (1 tick ≈ 16.7 ms). The tick value is shown in brackets.

### 4.1 Map

- The grid is **21 × 21** tiles. Coordinates are `(x, y)` with `0 ≤ x, y ≤ 20` and the origin at the top-left.
- **Hard walls (indestructible):**
  - The outer border: every tile with `x = 0`, `x = 20`, `y = 0` or `y = 20`.
  - Pillars on every second row and column: every tile where **both `x` and `y` are even**.
- **Every other tile** (odd x or odd y, not on the border) is either **empty** or a **soft wall**, decided randomly when the match is generated:
  - Soft wall density: **65 %** by default (configurable in Unrated arenas: 40–85 %).
  - **Every round gets a new random map.**
  - **Spawn safe zones** are always empty: the spawn tile plus the two tiles next to it along the corridors (an L shape). This guarantees that a player can place a bomb and escape.
- Spawn points (up to 4 players), one per corner:

  | Slot | Spawn | Safe tiles |
  |---|---|---|
  | P1 | (1, 1) | (2, 1), (1, 2) |
  | P2 | (19, 1) | (18, 1), (19, 2) |
  | P3 | (1, 19) | (2, 19), (1, 18) |
  | P4 | (19, 19) | (18, 19), (19, 18) |

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

| Action | Keys |
|---|---|
| Move | Arrow keys **or** W A S D |
| Place bomb | **SPACE** |
| Open menu / leave arena | ESC |

- If several direction keys are held at once, the most recently pressed one wins.
- Holding a direction keeps moving the player tile by tile.

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

#### 4.7.2 Interaction rules

- **Contact = instant kill.** A player is **eliminated immediately** (cause `alien`) when:
  - the player and an alien **occupy the same tile**, or
  - they **swap tiles** in the same tick, which prevents passing through each other.

  HP and invulnerability do **not** protect against this.
- **Telegraphing** (required, because contact is lethal):
  - A hunting Seeker or Brute changes appearance when it locks on, e.g. its eye turns red (see GUI Plan).
  - A spawn portal glows for 1.5 s before an alien appears, and portal tiles are harmless.
- Aliens are blocked by hard walls, soft walls and bombs. They **cannot** place bombs or destroy walls.
- Aliens do not block or harm each other, and they may overlap.
- Aliens are hurt by fire from any bomb (1 damage per blast). Sudden-death walls crush them.
- Aliens **never pick up** collectibles.
- **Kill credit** for an alien goes to the owner of the fire (§4.5). A player killed by an alien gives **no** player any kill credit.
- **Guaranteed drop:** when an alien dies, it drops its collectible(s) on its occupied tile once the fire there has ended. A Brute's second item goes on the nearest empty tile, found by BFS. If there is no free tile within 3 steps, the second item is skipped.

#### 4.7.3 Spawning

- Arena settings: **aliens on/off** (default on) and **max aliens** from 0 to 8 (default 4). Ranked arenas always use the default (§5.4.2).
- **At round start:** `max aliens` aliens spawn on random empty tiles that are at least **6 tiles (Manhattan distance)** away from every player spawn. If there are not enough empty tiles, the generator clears soft walls to make room.
- **Respawn:** every **30 s** [1800 ticks], if fewer than `max aliens` are alive, one new alien spawns on a random empty tile at least **5 tiles from every living player**.
- **Spawn warning:** a portal glows on the spawn tile for 1.5 s [90 ticks] before the alien appears. During that time the tile is harmless and the alien cannot be hurt.
- **Type mix:** Drifter 50 %, Seeker 35 %, Brute 15 %.
- All alien choices use the round's **seeded PRNG**, so a round replays identically from its seed plus the recorded inputs.

### 4.8 Rounds & match lifecycle (best-of-3)

#### 4.8.1 States

```
WAITING ─(≥2 players & all ready, or host starts)─► COUNTDOWN (3 s) ─► PLAYING
   ▲                                                    ▲                 │ (≤1 alive or time over)
   │                                                    │ match open      ▼
   └──── MATCH_END (12 s) ◄── match decided ─────── ROUND_END (5 s) ──────┘
```

- **WAITING:** between matches. Players can join, leave, ready up, and the host can change settings (Unrated only).
- **COUNTDOWN → PLAYING → ROUND_END:** one round. A new random map is generated for every round.
- **ROUND_END** (5 s): shows the round winner and the current score, then the next round's COUNTDOWN starts automatically.
- **MATCH_END** (12 s): shows the final standings and rating changes, then the arena goes back to WAITING. Players stay unless they leave.
- A full best-of-3 lasts at most about **10 min**: 3 × (3 s + 3 min + 5 s) + 12 s.

#### 4.8.2 A round

- **Players per arena:** 2–4. Bigger arenas are out of scope for now.
- **Time limit:** 3 min.
- **Sudden death** starts at **2:00**:
  - Hard walls start filling the arena in a spiral from the border inward, one tile every 0.5 s. That is 120 tiles by 3:00.
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

#### 4.8.3 The match (best-of-3)

| Rule | Value |
|---|---|
| Format | **Ranked:** always best-of-3. **Unrated:** host picks Bo1 / **Bo3** (default) / Bo5. |
| Win the match | Be the first to **2 round wins** (generally ⌈N/2⌉ for best-of-N) |
| Maximum rounds | **3** (N). Drawn rounds count as played but give nobody a round win. |
| Match ends when | Someone reaches 2 round wins, **or** 3 rounds have been played, **or** fewer than 2 players are still in the match |

**Match placement** (used for the final standings and for ELO). Players are sorted by:

1. **Round wins**, more is better.
2. **Total round points**, more is better.
3. **Placement in the last round played**, better is better.
4. If still equal, the players **share** the match placement. If they share 1st place, the match is a **draw**.

**Example:** 3 players where everyone wins one round.

| Round | Order | Points A / B / C |
|---|---|---|
| 1 | A, B, C | 3 / 2 / 1 |
| 2 | B, C, A | 1 / 3 / 2 |
| 3 | C, A, B | 2 / 1 / 3 |
| **Total** | 1 round win each | **6 / 6 / 6** |

Wins and points are tied, so the 3rd round decides it: **C 1st, A 2nd, B 3rd**.

#### 4.8.4 Joining, leaving and disconnecting

- **The roster is locked** when the first round's COUNTDOWN starts. Players who join an arena in the middle of a match **spectate** and play in the next match.
- **Disconnect during PLAYING:** the character stays in game (idle) for **15 s**, waiting for a reconnect. An idle character can still be killed. After 15 s the player is eliminated, and their elimination tick is the moment the grace period ran out.
- **Disconnect between rounds:** a player who is not back by the end of the next COUNTDOWN is eliminated at tick 0 of that round, which puts them last. They can rejoin in later rounds of the same match.
- **Leaving voluntarily** (ESC → Leave) is a **forfeit**:
  - The player is eliminated immediately in the current round and placed last in every remaining round.
  - In the match placement, forfeiting players rank **below everyone who stayed**. Among several forfeiters, whoever left later ranks higher.
  - So rage-quitting never improves a result.
- If only **one** player who has not forfeited is left, the match ends immediately and that player wins it.

---

## 5. Arenas, Lobby & Ranking

### 5.1 Lobby

- Shows the list of arenas with: name, **Ranked/Unrated** badge, format (Bo3…), status (Waiting / **Round 2 of 3, score 1–0** / Match end), players `n/4`, **average rating** (ranked arenas), whether it is private, whether aliens are on, **region and measured ping**.
- Actions:
  - **Quick Play:** joins a **ranked** WAITING public arena in the **lowest-ping region**. Among those, it prefers arenas whose average rating is within ±200 of the player's rating, then the fullest arena. If none is available, it creates a new ranked arena. Guests are matched by fullness only.
  - **Create Arena:**
    - Name, region (lowest ping preselected), max players (2–4), private (yes/no).
    - **Game mode:** **Ranked** or **Unrated**.
    - Unrated only: format (Bo1/Bo3/Bo5), soft wall density, wall drop rate, aliens on/off, max aliens.
    - Ranked uses the locked standard rules (§5.4.2).
  - **Join**: by clicking an arena in the list, or by entering a **6-character invite code** for a private arena.
- The list refreshes live over the socket.

### 5.2 Arena rules

- The creator is the **host** and can start the match early once at least 2 players are in, and can kick players. In ranked arenas a kick only takes effect between matches. If the host leaves, the host role passes to the player who joined next earliest.
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
| Unit | **One rating update per match** (the whole best-of-3), never per round |
| Seasons | **None in v1.** The rating is permanent, and there are no resets or decay. |

#### 5.4.2 When is a match rated?

A match is **rated** only if **all** of these hold:

1. The arena is **public** and in **Ranked** mode. Private arenas can only be Unrated, which stops friends from boosting each other.
2. The arena uses the **standard ruleset**, which is locked in Ranked mode: best-of-3, 65 % walls, 30 % wall drops, aliens on, max 4 aliens.
3. At least **2 registered players** were on the roster when the first round's COUNTDOWN started.
4. The match reached a result (§4.8.3). A match that ended early because opponents forfeited **is** rated, and the forfeiters lose.
5. The match finished normally. If a server crashes mid-match, the whole match, including rounds already played, is not rated (see [Events §9](./EVENTS-AND-MESSAGING.md#9-failure-scenarios)).

**Guests** may join Ranked arenas and play normally, but they are never rated and are left out of every ELO pair.

#### 5.4.3 Multiplayer ELO (pairwise method)

A 2–4 player match is treated as **every pair of registered players playing one game against each other**, scored by their **match placement** (§4.8.3), not by individual rounds. Guests are left out of every pair.

For registered players *i* and *j*:

```
E_ij  = 1 / (1 + 10^((R_j − R_i) / 400))          expected score of i vs j
S_ij  = 1    if placement_i better than placement_j
        0.5  if same placement (tie / draw / simultaneous death)
        0    if worse
Δ_i   = round( K_i / (N − 1) × Σ_j (S_ij − E_ij) )   N = number of rated players
R_i'  = max(100, R_i + Δ_i)
```

- **Placement** is the match placement: round wins, then round points, then the last round (§4.8.3).
- **How a player died does not matter.** A death to a bomb, an alien or a wall all count the same. Kills and alien kills do **not** change the rating directly; they only appear in stats.
- **Forfeiting** puts the player below everyone who stayed, so rage-quitting is never better than losing.
- Each player uses their **own K**. The sum of all deltas is therefore not exactly zero, which is standard and accepted.

**Example** (K = 24, 4 rated players):

| Player | Rating | Placement |
|---|---|---|
| A | 1200 | 1 |
| B | 1200 | 2 |
| C | 1300 | 3 |
| D | 1100 | 4 |

For A:

```
E_AB = 0.50, E_AC = 0.36, E_AD = 0.64  →  ΣE = 1.50
ΣS = 3
Δ_A = 24/3 × (3 − 1.50) = +12  →  1212
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
- The game server publishes **one** `match.finished` event per best-of-3 match, containing all of its rounds.
- The match-end screen shows "rating updating…" and then the delta, pushed to the client within ~1–2 s.
- *(v1.1)* Anti-farming: K is halved for a player's 6th+ match within 24 h against the exact same set of registered opponents.

---

## 6. System Architecture (summary)

```
            ┌───────────────────────────┐
 Browser ──►│ Cloud CDN + Cloud Storage │  (Vue SPA static files)
   │        └───────────────────────────┘
   │ HTTPS (REST)              WSS / WebTransport (game)
   ▼                            ▼
┌───────────────────┐   ┌──────────────────────────────┐
│ API service (Go)  │   │ Game servers (Go)            │
│ Cloud Run         │   │ lobby, arenas, tick loops    │
│ auth, profiles,   │   └───┬──────────────▲───────────┘
│ leaderboard       │       │ publish      │ LISTEN rating_updated
└───┬───────────────┘       │ match.finished
    │ outbox                ▼              │
    │               ┌────────────────┐     │
    └──────────────►│ Cloud Pub/Sub  │     │
                    │ (domain events)│     │
                    └───────┬────────┘     │
                            │ push         │
                            ▼              │
                    ┌────────────────┐     │
                    │ Rating worker  │─────┤
                    │ (Go, Cloud Run)│     │
                    └───────┬────────┘     │
                            ▼              │
                    ┌──────────────────────┴┐
                    │ Cloud SQL PostgreSQL  │
                    └───────────────────────┘
```

| Part | Summary | Details |
|---|---|---|
| **Backend** | **Go 1.25+**. A stateless **API service**, a stateful **game server** (one goroutine per arena, **60 Hz** simulation, **30 Hz** snapshots) and a **rating worker** that consumes domain events. | [Server & Network §3](./SERVER-AND-NETWORK.md#3-game-server-internals) |
| **Events** | In-game events go over the socket in real time and never through a queue. **Pub/Sub** carries durable domain events (`match.finished`). Postgres `LISTEN/NOTIFY` delivers rating-update notifications. | [Events & Messaging](./EVENTS-AND-MESSAGING.md) |
| **Network** | **Binary protocol** over WebSocket in v1. WebTransport datagrams are planned for v2. The client predicts its own movement and bombs, and draws other entities from an interpolation buffer. Players are routed to the nearest region. | [Server & Network §4–§7](./SERVER-AND-NETWORK.md#4-transport) |
| **Database** | **PostgreSQL 17** on Cloud SQL | §7 |
| **Frontend** | **Vue 3 + TypeScript + Vite + Pinia**. Vue handles the menus and HUD. A non-reactive game engine draws the game on a Canvas 2D at 60 FPS. | [GUI Plan](./GUI-PLAN.md) |

### 6.1 REST API (API service)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | – | Create account → tokens |
| POST | `/api/auth/login` | – | Login → tokens |
| POST | `/api/auth/guest` | – | `{nickname?}` → guest token |
| POST | `/api/auth/refresh` | cookie | New access token |
| POST | `/api/auth/logout` | user | Revoke refresh token |
| GET | `/api/me` | user/guest | Current identity + rating (users) |
| GET | `/api/regions` | – | Game regions + ping endpoints |
| GET | `/api/leaderboard?offset&limit` | – | Top players by rating (eligible only) |
| GET | `/api/users/:username` | – | Public profile, stats, rating, tier, rank |
| GET | `/api/users/:username/matches` | – | Paginated match history (with rating deltas) |
| GET | `/api/users/:username/rating-history` | – | Rating over time (for the chart) |
| GET | `/healthz`, `/readyz` | – | Health checks |

The real-time messages are specified in [Server & Network §5](./SERVER-AND-NETWORK.md#5-binary-protocol).

### 6.2 Technology rationale

**Decision:** Go game server and API, plus a Vue/TypeScript client. The client contains a **small TypeScript port of only the rules it predicts**, verified against test vectors generated by the Go simulation (option A below).

**Why Go fits this game:**

- The server only runs game rules: a 21×21 grid, ≤ 4 players, a few aliens, tile-by-tile integer movement. No engine, physics or rendering is needed on the server.
- The workload is many small concurrent arenas and many WebSocket connections. One goroutine per arena plus two per connection is cheap, and the language handles this well.
- Garbage collection pauses are typically well under 1 ms. The simulation makes 0 allocations per tick ([Server & Network §3.2](./SERVER-AND-NETWORK.md#32-the-simulation-package-internalgame)), and one tick is 16.7 ms, so GC is far below network jitter.
- Small static binaries start fast on Cloud Run, and one language covers the API, game server, worker and bots.
- Go is proven for game backends: Nakama and Agones are both written in Go.

**The real cost, and how it is handled:** client-side prediction needs part of the rules in the browser, so that part exists in two languages. The options:

| Option | Shared rules | Verdict |
|---|---|---|
| **A. Go server + TS port of the predicted rules + generated test vectors** | Kept in sync by CI | **Chosen.** Tile-by-tile movement keeps the port to roughly 300 lines. Explosions, damage, pickups and aliens are never predicted. |
| B. Compile `internal/game` to WebAssembly for the client | One codebase | Rejected for v1: adds roughly 0.5–1 MB gzipped (less with TinyGo) and JS↔WASM friction, for a port that is small anyway. It stays possible later because the simulation is pure. |
| C. TypeScript/Node server with **Colyseus** | Native | Rejected. Its main gains are room handling and delta state sync. We need room logic of our own anyway (best-of-3, ranked rules), and full snapshots are only about 120 B, so delta sync saves almost nothing. Colyseus also does not provide prediction or interpolation, which we would write either way. |
| D. **Nakama** (Go game backend with authoritative matches, auth, leaderboards) | Go match handlers | Rejected for v1: it replaces our own accounts, ELO and schema design with its model. The open-source edition runs as a single node (clustering is commercial), Go plugins must be built against the exact Nakama version, and it is stateful, so it does not fit Cloud Run. Worth revisiting only if the custom networking becomes a burden. |
| E. Rust | WASM-shareable | Rejected: much higher effort for no benefit at this scale. |

**Networking effort:** we write the networking ourselves, on top of `coder/websocket`. The parts and their rough size are listed in [Server & Network §3.6](./SERVER-AND-NETWORK.md#36-networking-code-build-vs-buy).

---

## 7. Data Model (PostgreSQL)

- **Engine:** Cloud SQL for **PostgreSQL 17**. Prod runs in HA (regional) mode with automated backups and 7-day point-in-time recovery, on a private IP.
- **Access:** IAM database authentication through the Cloud SQL Go connector and `pgxpool`.
- **Extensions:** `citext`.
- **IDs:** **UUIDv7**, generated in the application. They sort by time, which keeps the indexes compact.
- **Migrations:** `golang-migrate`, run as a Cloud Run job before each deploy.
- **Timeouts:** `statement_timeout = 5s` for API connections.

```sql
CREATE TABLE users (
  id             UUID PRIMARY KEY,
  username       CITEXT UNIQUE NOT NULL,
  email          CITEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX ON refresh_tokens (user_id);

CREATE TABLE player_ratings (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating         INT  NOT NULL DEFAULT 1200 CHECK (rating >= 100),
  peak_rating    INT  NOT NULL DEFAULT 1200,
  rated_matches  INT  NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- leaderboard: only players past placement
CREATE INDEX player_ratings_leaderboard
  ON player_ratings (rating DESC, user_id) WHERE rated_matches >= 10;

CREATE TABLE matches (
  id            UUID PRIMARY KEY,           -- = matchId from the game server
  arena_name    TEXT,
  region        TEXT NOT NULL,
  ruleset       TEXT NOT NULL,              -- 'standard' | 'custom'
  mode          TEXT NOT NULL CHECK (mode IN ('ranked','unrated')),
  best_of       SMALLINT NOT NULL CHECK (best_of IN (1,3,5)),
  rounds_played SMALLINT NOT NULL,
  rated         BOOLEAN NOT NULL,           -- rating actually applied (§5.4.2)
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ NOT NULL,
  duration_ms   INT NOT NULL,
  result        TEXT NOT NULL CHECK (result IN ('win','draw'))
);
CREATE INDEX ON matches (ended_at DESC);

CREATE TABLE match_rounds (                 -- one row per round of the best-of-N
  match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_no      SMALLINT NOT NULL,          -- 1..best_of
  seed          BIGINT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  duration_ms   INT NOT NULL,
  result        TEXT NOT NULL CHECK (result IN ('win','draw')),
  winner_slot   SMALLINT NULL,
  end_reason    TEXT NOT NULL CHECK (end_reason IN ('last_standing','timeout_hp','simultaneous')),
  players       JSONB NOT NULL,             -- [{slot, placement, points, eliminatedTick, deathCause, killerSlot, alienType, kills, ...}]
  input_log_uri TEXT,                       -- optional GCS replay of this round
  PRIMARY KEY (match_id, round_no)
);

CREATE TABLE match_players (
  match_id         UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  slot             SMALLINT NOT NULL,
  user_id          UUID NULL REFERENCES users(id) ON DELETE SET NULL,  -- NULL = guest
  display_name     TEXT NOT NULL,
  placement        SMALLINT NOT NULL,       -- MATCH placement (§4.8.3); 1 = best; ties share a value
  round_wins       SMALLINT NOT NULL DEFAULT 0,
  round_points     SMALLINT NOT NULL DEFAULT 0,
  forfeited        BOOLEAN  NOT NULL DEFAULT false,
  -- totals across all rounds of the match (per-round detail lives in match_rounds.players)
  kills            SMALLINT NOT NULL DEFAULT 0,
  alien_kills      SMALLINT NOT NULL DEFAULT 0,
  walls_destroyed  SMALLINT NOT NULL DEFAULT 0,
  powerups_taken   SMALLINT NOT NULL DEFAULT 0,
  bombs_placed     SMALLINT NOT NULL DEFAULT 0,
  rating_before    INT NULL,                -- NULL if unrated
  rating_after     INT NULL,
  PRIMARY KEY (match_id, slot)
);
CREATE INDEX ON match_players (user_id, match_id);

CREATE TABLE rating_history (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id       UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  rating_before  INT NOT NULL,
  rating_after   INT NOT NULL,
  delta          INT NOT NULL,
  k_factor       SMALLINT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, match_id)
);
CREATE INDEX ON rating_history (user_id, created_at DESC);

CREATE TABLE user_stats (                   -- denormalized for fast profile reads
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  matches_played INT NOT NULL DEFAULT 0,
  wins           INT NOT NULL DEFAULT 0,     -- matches won
  rounds_played  INT NOT NULL DEFAULT 0,
  round_wins     INT NOT NULL DEFAULT 0,
  forfeits       INT NOT NULL DEFAULT 0,
  kills          INT NOT NULL DEFAULT 0,
  alien_kills    INT NOT NULL DEFAULT 0,
  deaths         INT NOT NULL DEFAULT 0,
  deaths_by_alien INT NOT NULL DEFAULT 0
);

-- Messaging support (see EVENTS-AND-MESSAGING.md)
CREATE TABLE processed_events (             -- consumer inbox: idempotency
  event_id      UUID PRIMARY KEY,
  event_type    TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox (                       -- producer outbox (API service)
  id            UUID PRIMARY KEY,
  topic         TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ NULL,
  attempts      INT NOT NULL DEFAULT 0
);
CREATE INDEX outbox_unpublished ON outbox (created_at) WHERE published_at IS NULL;
```

- **Leaderboard rank** = `1 + count(*) of eligible players with a higher rating`. This query uses the partial index. Pages of the top 100 are cached in memory for 30 s.
- A self-kill is not counted as a kill.
- Arena state is **in-memory only**. The database only receives finished matches, through the event pipeline. The game server **never** writes to PostgreSQL directly.
- **Housekeeping:**
  - `processed_events` rows older than 30 days are deleted daily. Pub/Sub only redelivers within 7 days.
  - `outbox` rows that were published more than 7 days ago are deleted.

---

## 8. Deployment on GCP (summary)

| Concern | GCP service |
|---|---|
| Frontend hosting | **Cloud Storage** + **Cloud CDN** (or Firebase Hosting) |
| API service | **Cloud Run** (stateless, autoscaled) |
| Game servers | **v1:** a single Cloud Run instance in one region. **v2:** **GKE Autopilot** in 2–3 regions. |
| Rating worker | **Cloud Run** service behind a Pub/Sub **push** subscription (OIDC-authenticated) |
| Message queue | **Cloud Pub/Sub**: topic `match-events` + `match-events-dlq` (v1). `user-events` is added in v1.1. |
| Analytics (optional) | Pub/Sub → **BigQuery subscription** on `match-events` |
| Database | **Cloud SQL for PostgreSQL 17** (HA, private IP, primary region) |
| Arena directory / lobby pub/sub | **Memorystore for Redis** (v2) |
| Secrets | **Secret Manager** |
| Images / CI/CD | **Cloud Build** (CI + triggers), **Artifact Registry** (images), **Cloud Deploy** (staging → prod promotion with approval). See [CI-CD.md](./CI-CD.md). |
| Ingress / TLS / DDoS | **External HTTPS LB** + managed certs + **Cloud Armor**. A passthrough Network LB serves WebTransport in v2. |
| Observability | **Cloud Logging**, **Cloud Monitoring**, **Cloud Trace** (trace context propagated through events) |
| Infra as code | **Terraform** |
| Environments | `dev` (docker compose with Postgres + **Pub/Sub emulator**), `staging`, `prod`, each in its own GCP project, plus a shared `cicd` project for builds and images |

The topology, why it was chosen for latency, and the scaling path are covered in [Server & Network §8](./SERVER-AND-NETWORK.md#8-deployment-topology--scaling).

### 8.1 Regions (EU only)

| Role | Region |
|---|---|
| **Primary** (v1: everything) | **`europe-west3` (Frankfurt)**: central to the EU player base. Hosts Cloud SQL, Pub/Sub worker, API, game server, Artifact Registry. |
| v2 extra game regions | **`europe-west1` (Belgium)** for West/UK/Iberia and **`europe-central2` (Warsaw)** for Central/East. `europe-north1` (Finland) can be added for the Nordics if latency data supports it. |
| Cloud SQL HA standby | Same region (zonal failover). A cross-region read replica / DR copy goes in `europe-west1`. |

- **Data residency (GDPR):**
  - Pub/Sub **message storage policy** is restricted to EU regions.
  - The BigQuery dataset location is `EU`.
  - GCS buckets (replays, Terraform state, static assets origin) are `EU` / `europe-west3`.
  - Cloud SQL backups are stored in the EU.
  - An organization policy `gcp.resourceLocations = in:eu-locations` enforces all of this.
- **Expected latency:** with Premium Tier, players across the EU typically see about **10–40 ms** RTT to Frankfurt. v2 regions mainly add capacity and resilience and shave the edges, such as the Iberian peninsula and the Baltics.

---

## 9. Security & Fair Play

- **The server is authoritative:** clients send intents only. All movement, collisions, bombs, aliens, damage and pickups are computed on the server. Client-side prediction is cosmetic, and the server corrects it.
- **Ratings cannot be tampered with:**
  - Only the game server's service account may publish to `match-events`.
  - Only the rating worker's service account may write ratings.
  - Clients never submit results.
- The JWT is validated when the game socket connects. The `Origin` header is checked against an allow-list.
- Input validation and rate limits apply to REST and to the game socket (at most 90 binary messages/s: 60 commands plus pings). The server consumes exactly one command per player per tick, which makes speed hacks impossible.
- Usernames and nicknames go through a profanity filter.
- Only HTTPS/WSS is used. Security headers (CSP, HSTS) are set, and CORS is restricted to the frontend origin.
- Cloud Armor rate limiting at the load balancer.
- Passwords are never logged, and PII stays out of logs and events. Events carry user IDs and display names only, never emails.

---

## 10. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Latency | Your own move and bomb show on screen within **one frame** (prediction). Other entities are shown **≈ RTT/2 + 50–80 ms** behind the server. Explosions and other world events appear **≈ RTT/2 + 1 tick** after they happen on the server. In-region RTT target: p50 ≤ 40 ms. Server tick ≤ 1 ms per arena at p99. Full budget: [Server & Network §2](./SERVER-AND-NETWORK.md#2-latency-budget). |
| Durability | Once a match result is published, it is **never lost**. It survives game server restarts and Cloud SQL outages of up to 7 days (Pub/Sub retention). |
| Rating correctness | Each rating change is applied **exactly once** (at-least-once delivery + idempotent consumer). p95 time from match end to rating visible ≤ 3 s. |
| Performance | The client renders at 60 FPS on a mid-range laptop. Bundle size ≤ 300 KB gzipped (without assets). |
| Availability | 99.5 % monthly (v1). The game keeps running when the database is down; only ratings and profiles are delayed. |
| Scalability | ≥ 200 concurrent arenas per 2 vCPU instance. |
| Browser support | Latest 2 versions of Chrome, Firefox, Edge and Safari. |
| Observability | Metrics: active arenas/players/aliens, tick duration and jitter, RTT per region, send queue depth, reconnects, Pub/Sub publish latency and oldest unacked message age, DLQ size, rating processing lag. Structured JSON logs (`log/slog`). |
| Testing | Unit tests for `internal/game` (map gen invariants, blast propagation, chain reactions, pickups and caps, damage/invulnerability, alien AI, instant alien kill, drops, determinism) and `internal/rating` (ELO math, ties, guests, K-factors, eligibility). Idempotency tests for the consumer (duplicate and out-of-order delivery). Shared protocol test vectors for Go and TS. Playwright E2E with 2 clients under simulated latency. |
| Accessibility | Colorblind-safe player colors with name labels, remappable keys (see [GUI Plan](./GUI-PLAN.md#11-accessibility--i18n)). |

---

## 11. Acceptance Criteria (v1)

1. A visitor can register, log in, log out, or start as a guest in ≤ 2 clicks.
2. The lobby lists arenas live with region, ping, Ranked/Unrated badge and match progress. A player can quick-play, create (public/private, Ranked/Unrated) and join by code.
3. Every generated map is 21×21, has hard walls on the border and on every (even, even) tile, has soft walls only on other tiles, and has the 4 spawn safe zones clear.
4. SPACE places a bomb that explodes after 3 s in a + shape limited by range. Fire stops at hard walls, destroys the first soft wall it hits in each direction, and sets off other bombs.
5. A player starts with 1 bomb. Each **+Bomb** collectible lets them have one more bomb on the field at the same time, up to 8.
6. Destroyed soft walls sometimes drop +Health, +Fire or +Bomb, and the caps are enforced.
7. Aliens of all 3 types spawn away from players, move according to their behavior, **kill a player instantly on contact** (including tile swaps, regardless of HP or invulnerability), take damage from fire, respawn every 30 s up to the cap, and **always** drop collectibles when killed (Brute: 2).
8. A bomb hit removes 1 HP followed by 1.5 s of fire invulnerability, and 0 HP eliminates the player.
9. The last player alive wins the round. Sudden death starts at 2:00. At the 3:00 time-out, the survivor with the most HP wins, and a tie on the highest HP is a draw. Simultaneous final deaths produce a drawn round. Round placement follows HP for survivors, then elimination order.
10. A match is best-of-3: the first player to 2 round wins takes it, with at most 3 rounds. Every round has a new map and reset power-ups. Ties are broken by round points, then the last round. Forfeiting players are ranked last.
11. Several arenas run at the same time without interfering with each other.
12. With 100 ms of simulated RTT, your own movement and bomb placement still appear instantly, and remote players move smoothly without jitter.
13. After a rated best-of-3 match, every registered player's rating changes **once** according to §5.4. The delta appears on the match-end screen within 3 s, and on the profile and leaderboard. Unrated matches, private arenas and guests are never rated. There are no seasons or resets.
14. If the same `match.finished` event is delivered twice, the rating changes only once. If the database is down at match end, the rating is applied after it recovers.
15. Registered users' matches (with per-round detail) show up in their profile. Guests' results do not.
16. The app is deployed to GCP through CI from `main`.

---

## 12. Milestones

| # | Milestone | Content |
|---|---|---|
| M1 | **Core simulation** | `internal/game`: map gen, movement, bombs, fire, collectibles (incl. +Bomb), round result & placement, **best-of-N match logic** (round points, tiebreaks, forfeits), determinism tests |
| M2 | **Aliens** | Alien types, AI (wander/BFS hunt/danger avoidance), instant contact kill, spawning, guaranteed drops, tests |
| M3 | **Netcode** | Binary protocol + codecs (Go/TS) with shared test vectors, event sequencing and replay, WS gateway, arena tick loop, prediction and interpolation, latency simulator |
| M4 | **GUI** | Vue app shell, canvas renderer, HUD, lobby, waiting room, results ([GUI Plan](./GUI-PLAN.md)) |
| M5 | **Accounts & data** | Register/login/guest, JWT/refresh, PostgreSQL schema & migrations, profiles & stats |
| M6 | **Events & ranking** | Pub/Sub topics + DLQs, match publisher with local spool, rating worker (inbox, ELO), `LISTEN/NOTIFY` push, leaderboard, outbox table (relay enabled in v1.1) |
| M7 | **GCP deployment** | Terraform, Cloud Run, Cloud SQL, Pub/Sub, CDN, CI/CD, monitoring & alerts |
| M8 | **Polish** | Sprites, animations, sound, sudden death, settings, accessibility |
| v2 | **Scale & latency** | Multi-region GKE, Redis directory, WebTransport datagrams |
| v1.1+ | Extras | Phantom alien, +Speed/Kick, lobby chat, email verify/reset, touch controls, anti-farming |
| Later | Not in v1 | Rating seasons / resets, co-op / PvE modes |

---

## 13. Open Questions

Defaults are proposed above. Please confirm or change them:

**Resolved:**

- Match format is **best-of-3**.
- There are **no seasons** in v1.
- There are two game modes: **Ranked** and **Unrated**. Guests may join Ranked arenas but are never rated.

- Players start with **3 HP**, up to 5 with +Health.
- **2–4 players** per arena. No bigger arenas for now.
- **Sudden death** stays. At the 3:00 time-out **the player with less HP loses**.
- Movement is **tile-by-tile**.
- **EU regions only** (§8.1).

**Still open:**

1. **Git hosting** for CI/CD triggers: GitHub (assumed), GitLab or Bitbucket? See [CI/CD §9](./CI-CD.md#9-open-questions).
