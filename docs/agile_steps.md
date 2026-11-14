# BomberMan Online: Sprint Plan (1-week sprints)

| | |
|---|---|
| **Version** | 0.3 (draft) |
| **Date** | 2026-11-14 |
| **Based on** | [SPECIFICATION.md](./SPECIFICATION.md) 0.10, milestones §12, acceptance criteria §11 |

This plan cuts v1 into one-week sprints. **Every sprint ends with something a player can see and try**, and from sprint 2 on **real people test it every week**. Bugs, misunderstandings and "this isn't fun" come out while they are still cheap to fix, not after everything has been built.

### Changelog

| Version | Changes |
|---|---|
| 0.3 | Reordered for **a real game sooner**. Friends join through a **tunnel** from sprint 2, before any cloud setup. **Bombs (3) and a full round (4)** come before the live URL (5) and client prediction (6), so the first complete game is in week 4 instead of week 6. **Room links** (sprint 4) let several groups test at once. **Solo mode** (SPEC 0.10 §4.9) arrives with the first aliens in **sprint 8**, so one tester can play alone; phones move to sprint 9. A text-map test helper is added to sprint 1. |
| 0.2 | Reordered for earliest end-user feedback: live URL in sprint 3, prediction in sprint 4, phones in sprint 8, closed beta in sprint 14. Added the weekly playtest, a "Learn" question per sprint, replay capture, tunable rules and a 20 % feedback budget. |
| 0.1 | First draft. |

---

## 1. Principles

### 1.1 Vertical slices instead of layers

SPECIFICATION §12 orders the work **by layer**: M1 simulation, M2 aliens, M3 netcode, M4 GUI, M5 accounts, M6 ranking, M7 deployment, M8 polish. Nothing would be playable before M4, and nobody outside the project could try it before M7. That is a waterfall in disguise.

This plan cuts **vertically**. Each sprint adds a thin slice through every layer it needs (simulation → protocol → arena actor → client) and stops at something playable. All milestones are still covered (§6 maps them).

### 1.2 Feedback first: what gets tested how early

| Uncertainty | Why it is risky | First tested by players |
|---|---|---|
| Does the screen flow make sense? | Wrong flows are expensive once built | **Now** (sprint 0): the clickable mockups |
| Does the game run on testers' real networks, browsers and devices? | WebSockets behind proxies, Safari quirks, mobile browsers | **Sprint 2**, through a tunnel; again on the real server in sprint 5 |
| Is it fun? Are the timers, speeds and drop rates right? | Balance can only be judged by playing | **Sprints 3–4** (bombs, a full round), tuned every week after that |
| Does the cloud setup work? | New territory: GCP, TLS, release pipeline | **Sprint 5** |
| Does it feel responsive at real latency? | The hardest technical part | **Sprint 6**. Until then testers are told that lag is expected. |
| Are instant-kill aliens fair or frustrating? Is solo play fun? | Lethal contact is the riskiest rule in the spec, and solo is what people play when nobody else is online | **Sprint 8**, then sprint 10 |
| Can you play it on a phone? | Tile movement with a joystick is an open UX question | **Sprint 9** |
| Do strangers understand the lobby, ready-up and invites without help? | Social flows break in ways developers don't see | **Sprints 11–13**, wider in the closed beta (14) |
| Is ranked play fair, and are ratings correct? | Trust in ELO is fragile | **Sprints 16–18** with closed-beta testers |

**The trade-off in this order:** a complete game comes first, and smooth controls second. In sprints 2–5 the game is laggy for remote testers. That is accepted, because a laggy game that people can finish teaches more than smooth walking in an empty arena. To keep prediction cheap to add in sprint 6, the protocol carries input sequence numbers from sprint 2.

### 1.3 Rules that hold even in the thinnest slice

No sprint builds a throwaway shortcut that later has to be torn out:

- **The server is authoritative from sprint 1.** The browser never decides positions, damage or results.
- **`internal/game` is pure and deterministic from the first line**: integer math, seeded PCG, no `time.Now()`, no goroutines, 0 allocations per tick (CLAUDE.md). This is also what makes bug reports replayable (§4.3).
- **Test first.** Every function starts with a failing test (CLAUDE.md). Rule tests are written as small text maps (sprint 1), so a new rule's test is a few lines.
- **Binary protocol with golden vectors from sprint 2**, including input sequence numbers and the acknowledged sequence in snapshots. Control messages are JSON text frames, as specified (Server & Network §5.3).
- **Readable art from day one.** The canvas renderer starts from the mockups' drawing code (`docs/mockups/arena.js`), not from colored squares. Final sprites and animation come in sprint 19.

---

## 2. Overview

| Sprint | Theme | The demo in one sentence | Who tests it |
|---|---|---|---|
| 0 | Foundation *(done)* | Design docs, clickable mockups, database schema | 3–5 people click through the mockups |
| 1 | See the arena | Open the page and see a freshly generated arena in 3 sizes | You |
| 2 | **Walk around together** | Send a tunnel link; friends walk around the arena with you | **Alpha testers (friends)**, via tunnel |
| 3 | Bombs | Drop bombs, blow up walls, set off chain reactions | Alpha, via tunnel |
| 4 | **A real round** | The first complete game: fight until one is left, in your own room link | Alpha, via tunnel |
| 5 | **Live URL** | The game is online around the clock, with a bug-report button | Alpha, any time |
| 6 | Instant controls | Your own moves feel instant, even at 100 ms lag | Alpha |
| 7 | Power-ups & sudden death | The full core game, tuned from feedback | Alpha |
| 8 | **Aliens I & Solo mode** | Play alone against wandering aliens that kill on touch | Alpha, **solo testers** |
| 9 | Phones & tablets | Play with a virtual joystick on a phone | Alpha, on their phones |
| 10 | Aliens II | Hunting Seekers, armored Brutes, solo difficulty levels | Alpha, solo testers |
| 11 | Guests & lobby | Play as guest in 2 clicks, browse and create arenas | Alpha |
| 12 | Waiting room | Ready up, 15 s countdown, play, results, play again | Alpha |
| 13 | Friends & resilience | Private arenas with invite codes, Quick Play, reconnect | Alpha |
| 14 | **Closed beta** | 20–50 invited players; we see crashes and lag before they report them | **Beta testers (invited)** |
| 15 | Accounts | Register, log in, stay logged in | Beta |
| 16 | Ranked duels | Best-of-3 ranked 1-vs-1 with series score | Beta |
| 17 | ELO rating | Win a ranked match and see "+15" within 3 s | Beta |
| 18 | Profile & leaderboard | Your profile, rating chart, match history, solo best score, the leaderboard | Beta |
| 19 | Look & sound | Sprites, animations, sound effects and a settings menu | Beta |
| 20 | **v1.0** | Public launch: accessible, translated, load-tested, all acceptance criteria met | **Everyone** |

20 sprints, **without slack**. Each sprint from 3 on also reserves about 20 % of its time for fixes from the last playtest (§4.2), and §5.3 plans 3 buffer weeks. Realistically that is about 26 weeks.

---

## 3. Sprints

Each sprint lists:

- **Goal:** the sprint goal, as a player-facing sentence.
- **Demo:** what you show in the review.
- **Learn:** the question the playtest should answer. Write the answer down in the review (§4.1).
- **Scope:** the backlog items.
- **Done when:** checks, including the spec's acceptance criteria (§11, written as *AC n*).
- **New skills:** the parts that are new territory, so the week is planned with learning time.

### Sprint 0: Foundation *(done)*

- Design docs (`docs/`), screen mockups with Retro/Modern themes, GitHub Pages workflow, license (BSL 1.1).
- Database layer: local Postgres + pgAdmin compose stack, schema as Goose migrations (including solo mode, `00007`), `cmd/migrate`, pgxpool, sqlc, login roles and grants.
- `account` domain types with table-driven tests.
- **Still to do, costs an evening: a usability test of the mockups.** They are static HTML (`docs/mockups/index.html`). Open them for testers on a shared screen, or publish them next to the landing page by extending `pages.yml` to include `docs/mockups/`. Give 3–5 people a task ("join a friend's private game", "find your rating") and watch them click without helping. Flow problems found here are nearly free to fix.

The rest of the account slice (store, service, Gin handler) is planned for **sprint 15**, when registration matters to players.

---

### Phase A: A complete game, as early as possible

#### Sprint 1: See the arena

- **Goal:** "I open the game and see a battle arena."
- **Demo:** open `localhost`, choose Small / Medium / Large, and reload to get a new random map every time.
- **Learn:** do 15×15, 17×17 and 21×21 read well on a laptop screen, and does 65 % wall density look right?
- **Scope:**
  - `internal/game`: grid types, seeded PCG PRNG, map generator (border and pillar hard walls, 65 % soft walls, L-shaped spawn safe zones, 3 sizes) (Spec §4.1).
  - Map invariant tests: hard walls on the border and on (even, even) tiles, soft walls only elsewhere, safe zones clear, same seed gives the same map.
  - **Text-map test helper:** `ParseGrid` reads a map drawn with `#`, `+` and `.` (the spec's legend), and `Grid.String()` prints one. Every later rule test (movement, blasts, aliens) is written as "this map, these inputs, expect that", and `cmd/vectorgen` reuses the same maps.
  - `cmd/gameserver`: minimal WebSocket endpoint (`coder/websocket`) that sends the map as a JSON control message.
  - `web/`: Vite + Vue 3 + TS strict + Tailwind + Router scaffold with Vitest, Landing page from the mockup, `GameClient` (plain TS, `markRaw`) with a canvas renderer ported from `docs/mockups/arena.js` (GUI G1/G2).
  - `ci.yml`, first version: `go test`, `golangci-lint`, `npm run lint / typecheck / test / build` on pull requests.
- **Done when:** AC 3 (map invariants) passes as unit tests, and the canvas shows the map the server generated.
- **New skills:** Go packages and tests for pure logic; Vite/Vue project setup; WebSocket in Go.

#### Sprint 2: Walk around together

- **Goal:** "My friends and I walk around the same arena, each from home."
- **Demo:** start the server on your PC, open a tunnel, send the link: 2–4 friends walk around together with arrows or WASD.
- **Learn:** does the game connect on testers' networks and browsers (Safari, Firefox, company Wi-Fi, mobile data)? What is their real RTT? Does tile-by-tile movement at 9 ticks per tile feel right?
- **Scope:**
  - Movement rules (Spec §4.4): tile-by-tile, movement progress, occupancy switches at 50 %, buffered turns, blocked by walls, players overlap; most recently pressed key wins (§4.3).
  - `internal/arena`: one goroutine per arena, 60 Hz tick on an absolute schedule, input via SPSC ring, 30 Hz snapshots, non-blocking outbox (Server & Network §3.3). **One fixed arena** for everyone for now.
  - Binary protocol v0: input command and snapshot codecs in Go and TS, golden vectors in `/protocol/testdata` (S&N §5.1, §5.2, §5.5). **Inputs carry a sequence number and snapshots carry the last processed one per player**, so prediction (sprint 6) needs no protocol change.
  - Client: keyboard input, render players from snapshots. No prediction or interpolation yet.
  - The game server can serve the built web app, so one port is enough.
  - **Tunnel playtest:** a free quick tunnel (for example `cloudflared tunnel --url http://localhost:8080`) gives the local server a public HTTPS address for the length of a playtest. No account, no cloud setup. It works only while your PC is on, and it adds latency.
  - An alpha tester group (3–8 friends) and a fixed weekly playtest slot (§4.1). Feedback goes into GitHub issues by hand until sprint 5.
  - Zero-allocation benchmark for the tick (`testing.AllocsPerRun`).
- **Done when:** movement unit tests pass, codec golden vectors pass in Go **and** Vitest, and at least 2 people outside your home network walked around together.
- **New skills:** goroutines, tickers, ring buffers; binary encoding in Go (`encoding/binary`) and TS (`DataView`).

#### Sprint 3: Bombs

- **Goal:** "I can drop bombs and blow up walls."
- **Demo:** place a bomb, run, watch the + shaped blast destroy soft walls; line up bombs for a chain reaction.
- **Learn:** is the 3 s fuse right? Can testers read a blast's range before it goes off?
- **Scope:**
  - Bomb placement rules (alive, free tile, active < capacity), 180-tick fuse, standing on and leaving your own bomb (Spec §4.4, §4.5).
  - Explosion: range per direction, hard walls stop, the first soft wall is destroyed and stops the fire, chain reactions, 30-tick fire lifetime, fire ownership for kill credit.
  - Class A game events with arena-scoped `eventSeq` (`bomb.placed`, `bomb.exploded`, `wall.destroyed`), applied on the client through `EventDispatcher` → `world.ts` (GUI §5.4).
  - Client: draw bombs (with fuse), fire and wall removal.
- **Done when:** AC 4 passes as unit tests (blast shape, stops, chain reaction), and the tick still makes 0 allocations.
- **New skills:** event-sourced client state; table-driven tests for complex rules.

#### Sprint 4: A real round

- **Goal:** "I can beat my friend in a round." **This is the first complete game.**
- **Demo:** each group of testers opens its own room link and fights until one player is left; a results overlay shows the winner and placements, then a new round starts on a new map.
- **Learn:** is it fun? Are 3 HP and 1.5 s of invulnerability right? Do testers understand why they died?
- **Scope:**
  - HP 3, −1 per hit, 90 ticks of invulnerability with blinking, elimination at 0 HP, spectating after elimination (Spec §4.2).
  - Round lifecycle COUNTDOWN (3 s) → PLAYING → round over, 3:00 time limit, time-out compares HP (§4.8.2).
  - Round result and placement: last alive wins, a same-tick wipe is a draw, survivors ranked by HP, eliminated players by elimination tick, round points 3/2/1/0.
  - Kill credit and a simple kill feed; results overlay (GUI §4.6); the arena restarts automatically.
  - **Room links:** opening `/a/<code>` creates that arena or joins it (up to 4 players), and a *New room* button makes a fresh code. Several groups can test at the same time. This is the seed of the invite codes in sprint 13. *First item to cut if the week runs short.*
- **Done when:** AC 8 passes, and AC 9 passes except for sudden death. Determinism test: the same seed + inputs give the same result. Two rooms run at the same time without affecting each other.
- **New skills:** state machines in Go; determinism testing with recorded inputs.

#### Sprint 5: Live URL

- **Goal:** "The game is online. I can play whenever I want, and report what breaks."
- **Demo:** the live HTTPS URL, played without your PC being on. A bug report sent from the game's feedback button shows up as a GitHub issue, and a forced error shows up in Sentry.
- **Learn:** does the real server feel better than the tunnel? Do testers play outside the playtest slot when they can?
- **Scope:**
  - Resolve the open questions first: domain and VM size (CI-CD §10).
  - GCP bootstrap runbook (CI-CD §8): project, EU locations, Artifact Registry, VM in `europe-west3`, IAP SSH, firewall 80/443 only.
  - Production compose, first cut: Caddy (TLS + SPA) and gameserver. Postgres, Envoy, API and worker join in later sprints.
  - `release.yml`: build on push to `main`, manual approval through the `production` environment, `deploy.sh` on the VM (CI-CD §4.2, §4.3). First `dev` → `main` fast-forward.
  - **The feedback loop:**
    - Build number (version + commit SHA) visible in the footer.
    - A *Report a bug* button that opens a prefilled GitHub issue form (build, browser, room, round, tick).
    - **Sentry** (EU region) for browser and server errors, so crashes arrive without anyone reporting them.
    - Client RTT shown in a small debug overlay.
  - **Replay capture:** the arena keeps the seed and inputs of its recent rounds, the bug-report form includes the round id, and a Go test helper replays a captured round tick by tick. A tester's "I died through a wall" becomes a reproducible test. *Moves to sprint 7 if the cloud setup takes the whole week.*
- **Done when:** a merge to `main` deploys after approval, at least 3 testers played a round on the live URL, and a test error arrived in Sentry. This is AC 16.
- **New skills:** GCP (projects, IAM, Artifact Registry, Compute Engine), Caddy, a release pipeline with approvals, Sentry.

> **From here on, every sprint ends with a release and a playtest on the live URL.** Until v1.0 the live server is a test environment: the testers know things will break, and any data may be wiped before launch (see §7).

#### Sprint 6: Instant controls

- **Goal:** "My own character reacts instantly, even on a laggy connection."
- **Demo:** side-by-side at 100 ms simulated RTT, before and after: your own movement and bombs are instant, and other players move smoothly. Then the testers try it at their real latency.
- **Learn:** do testers still call it laggy? Do corrections (rubber-banding) show up at their real latency?
- **Scope:**
  - `web/src/game/sim/`: TS port of `canEnter`, `stepMovement` and `canPlaceBomb` only, about 300 lines (Spec §6.2).
  - `cmd/vectorgen` + `/protocol/testdata/rules`; Vitest replays the vectors tick by tick; CI fails on stale vectors.
  - Prediction + reconciliation (S&N §6.1), server input buffer (§6.2), bomb prediction (§6.3), interpolation buffer for remote players (§6.4), clock sync (§6.5).
  - Latency simulator in the debug overlay (toggle), and a count of reconciliation corrections, so testers' reports come with numbers.
  - First Playwright E2E: 2 clients under simulated latency.
- **Done when:** AC 12 passes, and the rule vectors pass in Go and Vitest.
- **New skills:** client-side prediction and reconciliation; generated test vectors as a contract between languages.

#### Sprint 7: Power-ups & sudden death

- **Goal:** "The game plays like real Bomberman."
- **Demo:** grab +Fire and +Bomb to dominate, pick up +Health, and survive the closing spiral in the last minute.
- **Learn:** are the drop rates (30 %) and caps fun? Does sudden death end rounds at the right moment, or too late?
- **Scope:**
  - Collectibles (Spec §4.6): 30 % drop chance from soft walls with 20/40/40 weights, appear after the fire ends, picked up on occupancy, caps (5 HP, range 10, 8 bombs), destroyed by later blasts.
  - Sudden death at 2:00: spiral hard walls with size-dependent speed, elimination under a falling wall, HUD warning 10 s before (§4.8.2).
  - HUD in Vue (timer, HP, range, bombs) fed through `hudBridge` at ≤ 10 Hz (CLAUDE.md, GUI §5.3).
  - **Tunable rules:** timings, rates and caps live in one `Ruleset` value passed to the simulation (not package constants), so balance changes from playtests are a one-line change plus regenerated vectors. The spec values stay the defaults, and any change goes back into SPECIFICATION §4.
- **Done when:** AC 5, 6 and 9 (now including sudden death) pass.
- **New skills:** keeping per-frame data out of Pinia (non-reactive engine vs. reactive HUD).

---

### Phase B: Aliens, solo play and phones

#### Sprint 8: Aliens I & Solo mode

- **Goal:** "I can play alone against deadly aliens, and hunt them for loot."
- **Demo:** press *Play solo*: Drifters wander the arena; touching one ends the run; blowing one up always drops a power-up; survive 3 minutes to win, and the result screen shows how many you killed. The same aliens also appear in multiplayer rounds.
- **Learn:** is solo play fun for more than two runs? Does the instant kill feel fair, or frustrating? Do testers notice the portals in time? Is "survive 3 minutes" the right goal?
- **Scope:**
  - Drifter type and wander AI (Spec §4.7.1).
  - Contact kill including tile swaps, ignoring HP and invulnerability (§4.7.2).
  - Fire damage, kill credit, guaranteed drop with 25/35/40 weights, 1 s pickup protection, crushed by sudden death without a drop.
  - Spawning: at round start ≥ 6 tiles from spawns (clearing soft walls if needed), respawn every 30 s ≥ 5 tiles from living players, 1.5 s portal (§4.7.3). Aliens on/off and max aliens are in the `Ruleset`.
  - **Solo mode** (Spec §4.9):
    - the round does not end while the single player is alive; win = alive at 3:00, loss = eliminated; score = aliens killed;
    - *Play solo* button on the Landing page: the server creates a private, unlisted arena and goes straight to the countdown;
    - result screen with "Survived!" / "Eliminated", the score, *Play again* and *Back*.
  - Client: render aliens with interpolation, and portals.
- **Done when:** the Drifter part of AC 7 passes as unit tests, the solo rules of AC 17 pass (difficulty and persistence come later), and replays stay deterministic with aliens.
- *Why solo matters for testing:* a solo tester needs nobody else to be online. That makes testers much easier to find, and it gives every later playtest something to do while waiting for an opponent.

#### Sprint 9: Phones & tablets

- **Goal:** "I can play on my phone."
- **Demo:** testers play the live URL on their own phones, solo or against each other: a floating joystick in the left half, a bomb button bottom-right, the arena scaled to fit.
- **Learn:** can you steer tile-by-tile reliably with a joystick? Is the bomb button where the thumb is? Which phones and browsers misbehave?
- **Scope:**
  - Touch controls (Spec §4.3, GUI §7.1): floating joystick snapped to 4 directions with a dead zone, bomb button, `pointer: coarse` detection, keyboard hints hidden.
  - Responsive canvas scaling (GUI §6.1), ☰ menu button, ESC menu.
  - Touch produces exactly the same commands as the keyboard, so the server and prediction need no changes.
- **Done when:** the touch bullet of AC 10 passes, and testers played a full round on at least one iOS and one Android phone.

#### Sprint 10: Aliens II

- **Goal:** "Some aliens hunt me, and some take three hits."
- **Demo:** a Seeker's eye turns red and it chases you around pillars while dodging your bombs; a Brute shrugs off two blasts and drops two items. Solo now has Easy, Normal and Hard.
- **Learn:** can testers outrun a Seeker as the spec promises? Is the lock-on telegraph noticed? Which solo difficulty do testers settle on?
- **Scope:**
  - Seeker: BFS hunt within 7 tiles, recomputed every 0.5 s, avoiding fire and short-fuse blast lines.
  - Brute: 3 HP, hunt within 5 tiles, 1 s invulnerability after hits, 2 drops (the second placed by BFS within 3 steps).
  - Type mix 50/35/15; lock-on telegraph visuals (GUI §6.3).
  - Solo difficulty choice: Easy 2 / Normal 4 / Hard 6 aliens (Spec §4.9).
  - Performance: BFS without allocations, and a benchmark for a 21×21 arena with 4 players and 8 aliens: tick ≤ 1 ms at p99 (Spec §10).
- **Done when:** AC 7 passes completely, and the tick-time and 0-alloc benchmarks are green.
- **New skills:** pathfinding on a grid; profiling Go (`pprof`, benchmarks).

---

### Phase C: Lobby, many arenas, closed beta

#### Sprint 11: Guests & lobby

- **Goal:** "I can play as a guest within 2 clicks and choose my arena."
- **Demo:** Landing → *Play as guest* → lobby with a live arena list → create an unrated arena with custom settings → a second tester joins it from the list. With an empty list, the lobby offers *Play solo*.
- **Learn:** do testers find each other without being told which arena to join? What do they do when nobody is there?
- **Scope:**
  - `cmd/api` with Gin: `POST /api/auth/guest` (generated or chosen nickname, profanity filter, guest JWT for 24 h), `/healthz`, `/readyz`, `HEAD /ping` (Spec §3.4, §6.1). Added to the prod compose.
  - Socket auth with the JWT, `Origin` allow-list (Spec §9).
  - Arena registry replaces the bare room links: arenas are created on demand, one arena per player (a second tab replaces the first), empty arenas are destroyed after 60 s.
  - Lobby list pushed over the socket (class B, in-process hub); Create Arena modal with the Unrated settings (max players, size, wall density, drop rate, aliens, max aliens) (Spec §5.1).
  - *Play solo* in the lobby, and the empty-list hint "Nobody is waiting right now. Play solo?".
- **Done when:** the guest part of AC 1, AC 11, and the list and create parts of AC 2 pass.
- **New skills:** Gin routing, handlers and middleware; JWT signing and validation.

#### Sprint 12: Waiting room

- **Goal:** "We ready up, the match starts by itself, and afterwards we can play again."
- **Demo:** three testers in a waiting room: everyone presses Ready, the 15 s countdown runs, a fourth tester joins and it pauses, then restarts when they are Ready; after the match, the results screen and back to the room.
- **Learn:** is the all-ready countdown understood without explanation? Does anyone get stuck waiting?
- **Scope:**
  - Arena states WAITING → READY_COUNTDOWN → COUNTDOWN → PLAYING → MATCH_END → WAITING (Spec §4.8.1). Solo arenas skip WAITING and READY_COUNTDOWN (§4.9).
  - All-ready countdown rules: pause on join or un-ready, restart from 15 s, cancel when fewer than 2 remain (§5.2).
  - Host role and hand-over, kick, a settings change un-readies everyone; roster locked at the countdown; mid-match joiners spectate.
  - Unrated match = single round: `round.end` with `matchDecided: true`, then `match.end`.
  - Waiting room and match-end screens from the mockups; lobby status "Starting in 0:12".
- **Done when:** the countdown bullet of AC 10 passes, with unit tests for every countdown rule.

#### Sprint 13: Friends & resilience

- **Goal:** "I can invite a friend to a private game, and a Wi-Fi hiccup doesn't kick me out."
- **Demo:** create a private arena, share the 6-character code, a tester joins by code; Quick Play drops a guest straight into a game; a tester switches their phone from Wi-Fi to mobile data mid-round and keeps playing.
- **Learn:** how often do real testers disconnect, and does the reconnect hold?
- **Scope:**
  - Private arenas with 6-character invite codes and *Join by code* (the room links from sprint 4, now with the private flag and the lobby UI); Quick Play for guests (fullest public unrated arena, or a new one) (Spec §5.1).
  - Leaving = forfeit, with the unrated forfeit placement rules (§4.8.4).
  - Disconnect handling: 15 s grace during PLAYING, rejoin between rounds, 10 s event replay ring and resync on gaps (Events §3, S&N §7).
  - Connection and error UX (GUI §9); region and ping display in the lobby (one region in v1).
- **Done when:** AC 2 passes completely for unrated arenas, and an E2E test survives a forced disconnect.

#### Sprint 14: Closed beta

- **Goal:** "20–50 invited players play without us sitting next to them, and we see problems before they report them."
- **Demo:** invitations sent to a wider group (friends of friends, a gaming community). Grafana shows live arenas, players, tick time and RTT; an alert fires on a forced error; a deploy during play doesn't kill running matches.
- **Learn:** what do people who have never talked to us get stuck on? Where do they quit? How many play solo because nobody else is online? Does the server hold real load?
- **Scope:**
  - Prometheus + Grafana on the VM with the game metrics (S&N §9.1: arenas, players, tick duration and jitter, RTT, send queue depth, reconnects), alerts, external uptime check (CI-CD §7).
  - Security pass before strangers arrive: CSP, HSTS, CORS, socket message rate limit (90/s), API rate limits (Spec §9).
  - Game server deploy procedure that drains running arenas (CI-CD §6.2), because testers will now be playing during deploys.
  - Simple funnel numbers in the logs (landing → lobby → first round → second round, split by solo and multiplayer), to see where people drop out.
  - A short beta survey linked from the match-end screen.
- **Done when:** the closed beta is open, dashboards and alerts work, and a deploy during a running match was tested.
- **New skills:** Prometheus, Grafana, alerting.

---

### Phase D: Accounts & ranked, tested by beta players

#### Sprint 15: Accounts

- **Goal:** "I have my own account and a reserved name."
- **Demo:** beta testers register (password typed twice), close the browser, come back and are still logged in; log out; their name shows without the guest marker in game.
- **Learn:** does anyone fail to register, and why (validation messages, password rules)?
- **Scope:**
  - Finish the account slice (BACKEND-ARCHITECTURE §4): store `CreateWithRating`, `account.Service.Register`, argon2id hasher, Gin handler, mockery mocks and testify tests.
  - Login with username or email, 15-minute access JWT kept in memory, 30-day refresh token (hashed, `HttpOnly` cookie, rotation and reuse detection), logout, rate limit of 5 failures per 15 min (Spec §3.3).
  - Vue register and login modals; registered names can't be used as guest nicknames.
  - Production: Postgres container, `migrate` container in `deploy.sh`, the roles script with passwords from Secret Manager, nightly `pg_dump` to Cloud Storage plus one restore drill (CI-CD §6.3).
  - Integration tests (`-tags=integration`) with `server/test/compose.yaml`, including the roles script and the constraint tests (DATABASE §8).
- **Done when:** AC 1 passes completely, the integration tests run in CI, and a backup was restored once.
- **New skills:** the store/repository layer, mockery, cookie-based auth, Secret Manager.

#### Sprint 16: Ranked duels

- **Goal:** "I can challenge someone to a ranked best-of-3 duel."
- **Demo:** two beta testers in a ranked arena: rounds 1–3 with the series score between rounds; a guest who clicks the ranked arena sees "Register to play Ranked".
- **Learn:** is best-of-3 the right length, or does the third round drag? Are forfeits common?
- **Scope:**
  - `internal/game/match`: best-of-3, round wins, round points, tiebreaks (points, then last round), forfeit = match loss, max 3 rounds (Spec §4.8.3), with the spec's worked example as a test.
  - ROUND_END state (5 s) with a series-score overlay; new map and reset power-ups every round.
  - Ranked arena mode: registered only, locked standard ruleset (Small, 2 aliens …), public; guest join rejected with `ranked_requires_account` (§5.4.2).
  - Lobby: Ranked / Unrated badges, "Round 2 of 3, score 1–0"; Quick Play for registered users goes to ranked arenas.
- **Done when:** AC 10 passes completely (ranked and unrated formats).

#### Sprint 17: ELO rating

- **Goal:** "Winning a ranked match raises my rating."
- **Demo:** finish a ranked duel: "rating updating…" turns into "+15 → 1215" within 3 s. Then stop Postgres, play another match, start Postgres, and the rating still arrives.
- **Learn:** do testers trust the numbers? Do they understand provisional K = 40?
- **Scope:**
  - `match.finished.v1` Protobuf schema in `protocol/events`, CloudEvents envelope, `buf breaking` in CI (Events §5).
  - Game server publisher with a bounded local spool; Pub/Sub topic `match-events` + DLQ in EU; emulator for local and integration tests.
  - `cmd/worker`: pull subscription, inbox (`processed_events`), persists the match aggregate, pure `internal/rating` (K-factors, floor 100, rounding), `NOTIFY rating_updated` in the same transaction (Events §7). Daily housekeeping job (DATABASE §6.1).
  - **Solo runs** of registered players go through the same pipeline: stored as `mode = 'solo'` matches, updating only `user_stats.solo_*` (DATABASE §3.5).
  - Game server `LISTEN` → `rating.updated` to both players; the match-end screen shows the delta.
  - Tests: ELO math (Spec §5.4.3 example), duplicate and out-of-order delivery, a solo run never touches ratings or PvP stats.
- **Done when:** AC 14 passes, and the match-end part of AC 13 passes.
- **New skills:** Pub/Sub, idempotent consumers, `LISTEN/NOTIFY`, Protobuf schemas.

#### Sprint 18: Profile & leaderboard

- **Goal:** "I can see my progress and how I rank against everyone."
- **Demo:** testers open their profile (tier badge, rank or "Placement 7/10", rating chart, match history with per-round detail, solo runs and best score), then the leaderboard; a tester deletes their account.
- **Learn:** does the leaderboard motivate testers to play more ranked matches? Do they try to beat their solo best score?
- **Scope:**
  - First gRPC services with buf: `AccountService.GetMe`, `ProfileService`, `LeaderboardService` (Spec §6.1), Envoy (gRPC-Web) in the prod compose, generated TS clients.
  - Leaderboard query with the partial index and a 30 s cache; tiers (§5.4.4).
  - Profile and leaderboard pages from the mockups (GUI §4.7, §4.7a), rating chart, solo stats; the solo result screen shows the personal best.
  - Lobby shows the waiting opponent's rating; ranked Quick Play prefers ±200 rating.
  - Account deletion / GDPR erasure (DATABASE §6.2).
- **Done when:** AC 13, 15 and 17 pass.
- **New skills:** gRPC, buf, Envoy, gRPC-Web.

---

### Phase E: Launch

#### Sprint 19: Look & sound

- **Goal:** "The game looks and sounds finished."
- **Demo:** the same match as before, now with sprites, walk and explosion animations, screen shake, sound effects and music; change the key bindings and the volume in Settings.
- **Learn:** do the effects hurt readability (can you still see the blast range)? Any performance drops on testers' older devices?
- **Scope:**
  - Sprite atlas, animations, effects (GUI §6.3, §6.4) for both the Retro and Modern themes.
  - Audio (GUI §8).
  - Settings modal: remappable keys, audio, display, network (GUI §4.8, G6).
  - Bring the mockups in `docs/mockups/` in line with what was built (solo screens included).
- **Done when:** the client still renders at 60 FPS on a mid-range laptop with all effects on.

#### Sprint 20: v1.0

- **Goal:** "Version 1.0 is out for everyone."
- **Demo:** walk through all 17 acceptance criteria (Spec §11) on the live URL, switch the language and the colorblind palette, then announce the launch.
- **Scope:**
  - Accessibility: colorblind-safe player colors with name labels (GUI §11).
  - i18n with vue-i18n (English + one more language).
  - Performance: bundle ≤ 300 KB gzipped, 60 FPS (Spec §10).
  - Load test with `cmd/bots`: ≥ 200 arenas on 2 vCPU (Spec §5.3).
  - OpenTelemetry traces (Spec §10); full Playwright E2E suite (GUI §12); bug bash; release notes.
  - Carry out the beta data decision (§7).
- **Done when:** all of AC 1–17 pass, and v1.0 is tagged and deployed from `main`.

---

## 4. The feedback loop

### 4.1 Weekly playtest (from sprint 2)

| Step | What |
|---|---|
| **Before** | Write the sprint's *Learn* question in the review notes. Sprints 2–4: start the tunnel and send the link. From sprint 5: release to the live URL. |
| **Playtest** (30–45 min, same slot every week) | Testers play the new build. Watch, don't explain; when they ask "what do I do now?", write it down. From sprint 8, solo testers can also play on their own time. |
| **After** | A 3-question form: what was fun, what was confusing, what broke. From sprint 5, bug reports arrive through the in-game button with build, browser and round id. |
| **Review** | Answer the *Learn* question in one or two sentences. Turn findings into GitHub issues labelled `playtest`. |

### 4.2 Feedback budget

- **From sprint 3 on, about 20 % of every sprint is reserved for `playtest` issues** from the previous week. Bugs found by testers go before new features.
- Findings that change the design (a different fuse time, a new countdown rule, a different solo goal) go into the docs in the same PR, so the spec never drifts from the game.
- If a playtest shows that the next planned sprint is the wrong next step, **change the plan.** This document is a forecast, not a contract.

### 4.3 Making bug reports reproducible

The simulation is deterministic (seed + inputs → identical round). From sprint 5, every round can be captured and replayed in a Go test. A tester's bug report with a round id becomes a failing test first and a fix second, which is the test-first rule applied to bugs.

---

## 5. Working agreements

### 5.1 Definition of Done (every sprint)

- The demo runs from merged code: `dev` on your PC (through the tunnel in sprints 2–4), the live URL from sprint 5 on. Never a local hack.
- Every function was written test-first (CLAUDE.md), and every change reached `dev` through a PR (squash-and-rebase) with CI green.
- Game rules have unit tests; the tick stays at 0 allocations; rule and codec vectors are regenerated and committed when rules change.
- The docs are updated in the same PR when a design decision changed.
- From sprint 5 on: `dev` → `main` fast-forward, a production release, and the playtest (§4.1) at the end of the sprint.

### 5.2 Ceremonies, scaled for a small team

| Ceremony | When | What |
|---|---|---|
| **Planning** | Monday, 30 min | Triage last week's `playtest` issues first. Then pick the sprint goal from this plan, split the scope into GitHub issues, cut anything that doesn't fit, and mark the learning items. |
| **Playtest + review** | End of the week | §4.1. |
| **Retro** | After the review, 15 min | What slowed us down? Adjust the next sprint's scope. |

Track the sprints as GitHub Milestones (`Sprint 01` …) with one issue per scope item, so the board stays next to the code.

### 5.3 When a sprint doesn't fit

- **Protect the playable demo, not the scope.** If the week runs short, cut scope items but keep the sprint goal playable. Unfinished items move to the next sprint.
- **Measure velocity after sprints 1–3** and re-plan. Sprints 4, 5, 6, 8 and 17 are the densest; each can be split in two without breaking "a demo every week".
- **Buffer weeks** after sprints 7, 14 and 18, for bigger surprises from playtests, refactoring and catching up on learning.

---

## 6. Traceability

### 6.1 Milestones → sprints

| Milestone (Spec §12) | Sprints |
|---|---|
| M1 Core simulation | 1, 2, 3, 4, 7, 16 |
| M2 Aliens (incl. solo mode) | 8, 10 |
| M3 Netcode | 2 (codec, arena actor), 3 (events), 6 (prediction, interpolation), 13 (replay, reconnect) |
| M4 GUI | 1 (shell, canvas), 7 (HUD), 9 (touch), 11–13 (lobby, waiting room), 18 (profile, leaderboard) |
| M5 Accounts & data | 0 (schema), 11 (guest), 15 (accounts), 18 (gRPC services) |
| M6 Events & ranking | 17, 18 |
| M7 v1 deployment | 1 (CI), 5 (VM, release, Sentry), 14 (metrics, alerts, security), 15 (Postgres, backups), 20 (traces) |
| M8 Polish | 7 (sudden death), 19 (sprites, sound, settings), 20 (accessibility, i18n) |

### 6.2 Acceptance criteria → sprints

| AC (Spec §11) | Topic | Sprint |
|---|---|---|
| 1 | Register, login, logout, guest in ≤ 2 clicks | 11 (guest), 15 |
| 2 | Lobby, quick play, create, join by code | 11, 13, 16 (ranked) |
| 3 | Map generation invariants | 1 |
| 4 | Bombs, blast shape, chain reaction | 3 |
| 5 | Bomb capacity and +Bomb | 7 |
| 6 | Drops and caps | 7 |
| 7 | Aliens | 8, 10 |
| 8 | HP, invulnerability, elimination | 4 |
| 9 | Round result, sudden death, placement | 4, 7 |
| 10 | Ranked Bo3 / unrated Bo1, ready countdown, touch | 9, 12, 16 |
| 11 | Concurrent arenas | 4 (room links), 11 |
| 12 | Instant controls at 100 ms RTT | 6 |
| 13 | Rating once, delta within 3 s, profile, leaderboard | 17, 18 |
| 14 | Duplicate delivery, DB outage | 17 |
| 15 | Match history in profile | 18 |
| 16 | Deployed by GitHub Actions with approval | 5 |
| 17 | Solo mode | 8 (rules, start, result), 10 (difficulty), 17 (stored), 18 (profile, best score) |

---

## 7. Open questions

1. **Domain and VM size** (CI-CD §10) must be decided before sprint 5.
2. **Beta data at launch:** keep the beta testers' accounts and ratings at v1.0, or reset them? The spec has no seasons or resets *after* launch (§5.4.1); a one-time reset before launch would give everyone a fair start, but costs early testers their progress. Decide before sprint 15, and tell the testers when they register.
3. **Tester recruitment:** who are the 3–8 alpha testers (sprint 2) and the 20–50 beta testers (sprint 14)?
4. **Solo scoring and pressure** (Spec §13): is "survive 3 minutes" the right goal, should alien types score differently, is a 30 s respawn enough on Easy? The sprint 8 and 10 playtests answer this.

---

## 8. After v1 (backlog, not planned)

From Spec §12: v1.1 extras (Phantom alien, +Speed/Kick, lobby chat, email verification and password reset, anti-farming, ranked matchmaking queue, outbox relay, solo while waiting for an opponent, a solo leaderboard) and v2 scaling (GKE + Helm, Cloud SQL, multi-region game pods, Redis directory, WebTransport). Each becomes its own sprint once v1 is out, following the same "playtest every week" rule.
