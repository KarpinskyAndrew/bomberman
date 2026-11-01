# BomberMan Online: GUI Plan (Vue)

| | |
|---|---|
| **Version** | 0.2 (draft) |
| **Date** | 2026-10-27 |
| **Parent** | [SPECIFICATION.md](./SPECIFICATION.md) · Netcode: [SERVER-AND-NETWORK.md](./SERVER-AND-NETWORK.md) · Events: [EVENTS-AND-MESSAGING.md](./EVENTS-AND-MESSAGING.md) |

**Changes in 0.2:**

- Ranked/ELO UI: lobby badges, rating deltas on the results screen, profile rating chart and a new leaderboard page.
- A client-side event dispatcher (§5.4).
- Lethal alien telegraphing.

---

## 1. Principles

1. **Vue for the UI, not for the game loop.** Vue components render menus, dialogs and the HUD. The arena is drawn by a plain TypeScript **game engine** onto a `<canvas>` at 60 FPS. Per-frame data (positions, fire, animations) **never goes into reactive state**, because proxies and watchers at 60 Hz waste CPU and cause GC hitches.
2. **The game screen comes first.** Nothing overlaps the arena while a match is running except short, non-blocking toasts.
3. **Retro pixel art with a modern, clean UI.** Crisp integer-scaled sprites and a dark theme.
4. **Readable at a glance.** Each player has a distinct color and shape, alien threats are clearly telegraphed, and danger (fire about to happen) is obvious.
5. **Keyboard first.** All menus can be used with the keyboard. The game uses arrows/WASD and SPACE.

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Framework | **Vue 3** (Composition API, `<script setup>`), **TypeScript** (strict) |
| Build | **Vite** |
| State | **Pinia** (UI/session state only) |
| Routing | **Vue Router** |
| Styling | **Tailwind CSS** + CSS variables for theme tokens (no heavy component kit) |
| Game rendering | **Canvas 2D**, hand-written renderer (PixiJS only if effects outgrow Canvas 2D) |
| Audio | **Web Audio API** (a small wrapper; `howler.js` is acceptable) |
| HTTP | `fetch` wrapper with automatic token refresh |
| i18n | `vue-i18n` (EN first, structure ready for more languages) |
| Testing | **Vitest** (units: codec, prediction, interpolation, stores), **Vue Test Utils**, **Playwright** (E2E) |
| Lint/format | ESLint + Prettier, `vue-tsc` in CI |

---

## 3. Screen Map & Navigation

```
          ┌──────────┐
          │ Landing  │───────────────┐
          └────┬─────┘               │
   Login/Register (modal)   Play as Guest (nickname modal)
               └──────────┬──────────┘
                          ▼
                    ┌──────────┐   Create Arena (modal)
                    │  Lobby   │── Join by Code (modal)
                    └────┬─────┘   Quick Play
                         ▼
               ┌──────────────────┐
               │ Arena /arena/:id │  phases inside one view:
               │  Waiting Room    │
               │  → Countdown     │
               │  → Game          │
               │  → Results       │──► back to Waiting Room (next match)
               └──────────────────┘
   Global: Profile (/profile/:username), Leaderboard (/leaderboard), Settings (modal, any screen), ESC menu (in-game)
```

| Route | View | Guard |
|---|---|---|
| `/` | `LandingView` | Redirects to `/lobby` if a session exists |
| `/lobby` | `LobbyView` | Requires a session (user or guest) |
| `/arena/:id` | `ArenaView` | Requires a session. A deep link with `?code=XXXXXX` joins a private arena directly. |
| `/profile/:username` | `ProfileView` | Public |
| `/leaderboard` | `LeaderboardView` | Public |
| `/:pathMatch(.*)` | `NotFoundView` | – |

Login, register, guest nickname, create arena, join by code and settings are **modals**, so the user never loses their context.

---

## 4. Wireframes

### 4.1 Landing

```
┌──────────────────────────────────────────────────────────────┐
│                       💣 BOMBERMAN ONLINE                     │
│                 (animated demo arena in background)            │
│                                                                │
│                   [ ▶  PLAY AS GUEST        ]                  │
│                   [    LOG IN               ]                  │
│                   [    REGISTER             ]                  │
│                                                                │
│        Players online: 412   ·   Arenas running: 97            │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Lobby

```
┌──────────────────────────────────────────────────────────────────────┐
│ 💣 BomberMan   Lobby   🏆 Leaderboard     Andrew 🥇1342 ▾  ⚙  ● EU 24 ms │
├──────────────────────────────────────────────────────────────────────┤
│ [ ⚡ QUICK PLAY (Ranked) ]   [ + CREATE ARENA ]   [ # JOIN BY CODE ]   │
│                                                                       │
│ Filter: [All regions ▾] [Ranked+Unrated ▾] [☐ Hide full]  🔍 search    │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Name          Mode         Region Ping Players Avg ★ Status        │ │
│ │ Friday Blast  RANKED Bo3   EU     24ms ●●●○ 3/4 1310 Waiting [JOIN]│ │
│ │ noobs only    unrated Bo5  EU     24ms ●●○○ 2/4  –   Round 2/5 1–0 │ │
│ │ 🔒 private    unrated Bo3  EU-PL  38ms ●○○○ 1/4  –   Waiting [JOIN]│ │
│ └───────────────────────────────────────────────────────────────────┘ │
│ You: Gold · 1342 (#87) · 42 matches · 13 wins · 88 kills · 140 aliens │
└──────────────────────────────────────────────────────────────────────┘
```

- Rows update live: they animate in and out, and the player counts change in place.
- High-ping rows (> 120 ms) are dimmed and show a warning icon.
- Guests see a "Register to get a rating" hint instead of their rating line.
- Ranked rows show a tooltip "Standard rules · rated for registered players".

### 4.3 Create Arena (modal)

```
┌─ Create Arena ─────────────────────────────┐
│ Name          [ Friday Blast           ]   │
│ Region        [ EU (24 ms) ▾ ]             │
│ Max players   ( 2 ) ( 3 ) (•4)             │
│ Private       [ ]  → invite code on create │
│ Game mode     (•Ranked) ( Unrated )        │
│ ── Custom rules (Unrated only) ─────────── │
│ Format        ( Bo1 ) (•Bo3) ( Bo5 ) (lock)│
│ Wall density  ───────●────  65 %  (locked) │
│ Wall drops    ────●───────  30 %  (locked) │
│ Aliens        [✓]  Max ──●──── 4  (locked) │
│                        [Cancel] [Create]   │
└────────────────────────────────────────────┘
```

- Turning on **Private** switches the mode to **Unrated** and disables Ranked.
- While Ranked is selected, the custom-rule controls are disabled and show the standard values (Bo3, 65 %, 30 %, 4 aliens).

### 4.4 Waiting Room

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Leave     Friday Blast   🔒 Code: K7M2QX [copy] [copy link]      │
├──────────────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                     │
│  │ 🟦 P1  │ │ 🟧 P2  │ │ 🟩 P3  │ │  empty │                     │
│  │ Andrew │ │Guest-48│ │ Kate   │ │ waiting│                     │
│  │ ★ host │ │ guest  │ │        │ │  ...   │                     │
│  │ ✔ ready│ │ ✔ ready│ │ ✖      │ │        │                     │
│  └────────┘ └────────┘ └────────┘ └────────┘                     │
│  RANKED · Best of 3 · 65 % walls · 30 % drops · Aliens: 4        │
│  Map preview: (blurred mini-map of the 21×21 layout)             │
│            [ READY ✔ ]        [ START ▶ ] (host only, ≥ 2)       │
└──────────────────────────────────────────────────────────────────┘
```

### 4.5 In-Game

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⏱ 1:42   Friday Blast · ROUND 2 / 3   ⚠ SUDDEN DEATH IN 0:22  ● 24 ms │
├──────────────┬──────────────────────────────────────┬────────────────┤
│ 🟦 Andrew ●○ │                                      │ 🟧 Guest-4821 ○○│
│ ❤❤❤♡♡        │                                      │ ❤❤♡♡♡          │
│ 🔥3  💣1/2   │                                      │ 🔥2  💣0/1     │
│              │        21 × 21 ARENA CANVAS          │                │
│ 🟩 Kate      │      (integer-scaled, centered)      │ ⬜ —           │
│ ☠ eliminated │                                      │ (empty slot)   │
│              │                                      │                │
│ 👾 Aliens: 3 │                                      │                │
├──────────────┴──────────────────────────────────────┴────────────────┤
│ Kill feed:  Andrew 💥 Seeker (+💣)  ·  Kate ☠ 👾 Brute                 │
└──────────────────────────────────────────────────────────────────────┘
```

- **Own player card** is highlighted. `💣 1/2` means 1 bomb on the field out of a capacity of 2.
- **Sudden death:**
  - From 2:00 the timer turns red and shows the hint "⏱ At 3:00 the player with the most ❤ wins".
  - The player cards are sorted by HP, and the current leader gets a 👑 marker.
  - The Round End banner says why the round ended: "Time! Andrew wins on health (3 ❤ vs 2 ❤)".
- **Round-win pips** (`●○`) next to each name show round wins toward the 2 needed. A forfeited player's card is greyed out with "forfeited".
- **Collectible pickup feedback:**
  - a floating "+1 💣" text above the player,
  - the HUD stat flashes,
  - a short sound plays.
- **Being hit by a bomb:**
  - the screen edge flashes red,
  - the hearts shake,
  - the player sprite blinks while invulnerable (fire only).
- **Killed by an alien** (instant): a short "grabbed" animation plays, the alien's portrait appears in the death banner ("Eaten by a Brute"), and then spectating starts.
- **Lethal alien warnings** (because contact kills instantly):
  - Every alien has a faint red **danger halo** on its occupied tile.
  - A hunting Seeker or Brute shows a **lock-on line** toward its target, and the targeted player's own card shows a 👁 warning.
- **Spectating** (after elimination): the canvas stays live with a "Spectating" banner and a [Leave arena] button.

### 4.6 Countdown, Round End & Match End overlays

- **Countdown:** "ROUND 2" title, then a big "3 · 2 · 1 · GO!" over a dimmed canvas. Each player's spawn tile pulses in their color. For round 3 when the score is tied, the title reads "DECIDING ROUND".
- **Round End** (5 s, non-blocking banner over the frozen canvas):

```
┌─ Round 2 ─────────────────────────────────────┐
│  🏁 Guest-4821 takes the round!               │
│  Score   Andrew ●○   Guest-4821 ●○   Kate ○○  │
│  Points    5            5            2        │
│  Round 3 starts in 4 s…                       │
└───────────────────────────────────────────────┘
```

- **Match End** (12 s, with a countdown bar back to the waiting room):

```
┌─ Match Over · RANKED · Best of 3 ───────────────────────────────────┐
│   🏆  Andrew wins the match 2–1!                        (or DRAW)    │
│   #  Player      R1 R2 R3  Wins Pts  Kills Aliens  Rating           │
│   1  Andrew      🏆 2  🏆   2    8     3     5     1342 → 1356 ▲14   │
│   2  Guest-4821  2  🏆 3    1    6     1     2     unrated          │
│   3  Kate        3  3  2    0    4     0     1     1290 → 1276 ▼14   │
│   [ Round details ▾ ]  (deaths, killers, per-round stats)           │
│  Back to waiting room in 9 s     [ Stay ]  [ Leave arena ]          │
└─────────────────────────────────────────────────────────────────────┘
```

- **Rating column states:**
  - "updating…" (shimmer) after `match.end` with `ratingPending: true`.
  - The animated delta when `rating.updated` arrives.
  - Fallback: if nothing arrives within 5 s, the client calls `GET /api/me` once.
- If the own player crosses a tier boundary, a **tier-up/down badge** animation plays.
- Unrated matches show no rating column.

### 4.7 Profile

- **Header:**
  - username, tier badge, **rating** (peak in small text), **global rank**, or "Placement 4/10" while still in the placement period;
  - member since, total matches, wins, win rate, kills, alien kills, deaths by alien.
- **Rating history chart:** a line chart of the last 100 rated matches, with tier bands shaded in the background.
- **Match history table:** paginated, with a Ranked/Unrated badge, the round score (e.g. 2–1) and the rating delta per match. Each row expands to show per-round detail.

### 4.7a Leaderboard

```
┌─ 🏆 Leaderboard ─────────────────────────────────────────────┐
│  #   Player          Tier       Rating   Matches   Win %     │
│  1   blastqueen      Diamond     1912      341      38 %     │
│  2   kaboom_kid      Diamond     1874      512      33 %     │
│  …                                                            │
│  87  ► Andrew        Gold        1342       42      31 %     │  (own row pinned & highlighted)
│                 [ ‹ Prev ]  page 1 / 40  [ Next › ]           │
└──────────────────────────────────────────────────────────────┘
```

- 25 rows per page, and clicking a row opens the player's profile.
- The own row is pinned at the bottom if it is not on the current page.

### 4.8 Settings (modal)

| Tab | Options |
|---|---|
| Controls | Remap Up/Down/Left/Right/Bomb, alternate keys |
| Audio | Master, SFX, Music volume, mute |
| Display | Scale (auto / 2× / 3×), show ping, show FPS, reduced motion, colorblind palette |
| Network | Region override, interpolation mode (auto / smoother / lower latency) |
| Dev (dev builds only) | Latency simulator: delay, jitter, loss |

---

## 5. Front-End Architecture

### 5.1 Folder structure

```
web/src/
  main.ts  App.vue  router.ts
  api/          http.ts (fetch + refresh), auth.ts, users.ts, regions.ts
  net/
    connection.ts   socket lifecycle, AUTH, heartbeat, reconnect/resume, transport fallback
    transport/      ws.ts, webtransport.ts (v2): same interface
    codec.ts        binary encode/decode (golden-vector tested)
    protocol.ts     message/event enums & types
    clock.ts        server tick estimate, RTT/jitter stats
  game/
    GameClient.ts   orchestrates: inputs → prediction → network → world → renderer
    events/
      EventDispatcher.ts  seq dedupe/gap detection → world reducer → subscribers
      types.ts            discriminated union of all game events (+ assertNever)
    world.ts        non-reactive world state (grid, bombs, fires, items, entities); the ONLY mutator is applyEvent/applySnapshot
    sim/            TS port of ONLY the predicted rules: movement.ts (canEnter, stepMovement), bombs.ts (canPlaceBomb); ~300 lines, verified by /protocol/testdata/rules
    prediction.ts   pending commands, reconciliation, correction blending
    interpolation.ts snapshot buffer, adaptive delay
    input.ts        keyboard → command bits, key remapping
    renderer/
      Renderer.ts   layer composition, scaling
      layers/       StaticLayer, FloorItemsLayer, BombsLayer, FireLayer,
                    EntitiesLayer, EffectsLayer, LabelsLayer
      sprites.ts    atlas loader & frame lookup
      animations.ts tweening, frame timing
    audio.ts        SFX + music
    hudBridge.ts    throttled push of HUD values into Pinia
  stores/       auth.ts, session.ts, lobby.ts, arena.ts, hud.ts, settings.ts, connection.ts, rating.ts
  views/        LandingView, LobbyView, ArenaView, ProfileView, LeaderboardView, NotFoundView
  components/
    common/     BaseButton, BaseModal, BaseSlider, Toast, Spinner, KeyCap, PingBadge
    auth/       LoginForm, RegisterForm, GuestNicknameForm
    lobby/      ArenaTable, ArenaRow, QuickPlayButton, CreateArenaDialog, JoinByCodeDialog, RegionPicker
    arena/      WaitingRoom, PlayerSlotCard, GameStage, GameCanvas, HudPlayerCard,
                HudTimer, KillFeed, RoundScoreBar, CountdownOverlay, RoundEndOverlay, MatchEndOverlay,
                SpectatorBanner, ReconnectOverlay, EscMenu
    profile/    StatsSummary, MatchHistoryTable, RatingHistoryChart
    ranking/    TierBadge, RatingDelta, LeaderboardTable, RankedBadge
    settings/   SettingsDialog, KeyBindingRow
  assets/       sprites/atlas.png + atlas.json, sfx/*.ogg, fonts/
  i18n/         en.json
```

### 5.2 Component tree (Arena view)

```
ArenaView
├─ WaitingRoom            (phase = waiting)
│   └─ PlayerSlotCard ×4
└─ GameStage              (phase = countdown | playing | round_end | match_end)
    ├─ HudTimer, PingBadge
    ├─ HudPlayerCard ×4   (reads hud store)
    ├─ GameCanvas         (mounts GameClient; owns <canvas>; no reactive per-frame data)
    ├─ KillFeed
    ├─ RoundScoreBar      (round n/N, round-win pips)
    ├─ CountdownOverlay   (phase = countdown)
    ├─ SpectatorBanner    (own player eliminated)
    ├─ RoundEndOverlay    (phase = round_end)
    ├─ MatchEndOverlay    (phase = match_end)
    ├─ ReconnectOverlay   (connection.status = reconnecting > 1 s)
    └─ EscMenu            (ESC)
```

### 5.3 State management

| Store | Holds | Update rate |
|---|---|---|
| `auth` | Access token (in memory), identity, role (user/guest) | Rare |
| `connection` | Status (connecting/open/reconnecting/closed), region, RTT, jitter | 0.5 Hz |
| `lobby` | Arena list, filters, measured region pings | On update |
| `arena` | Arena meta, players, host, phase, invite code, results | On control messages |
| `hud` | Per player: hp, range, bombCap, bombsActive, alive. Timer, alive aliens, kill feed | **Only on change**, throttled to ≤ 10 Hz |
| `settings` | Key bindings, volumes, display/network prefs (persisted to `localStorage`) | Rare |
| `rating` | Own rating, tier, rank, placement progress, pending delta for the last match | On `rating.updated` / `GET /api/me` |

**Data flow:**

```
Socket ─► codec ─► GameClient ─┬─► world (plain objects) ─► Renderer (rAF, 60 FPS)
                               ├─► prediction / interpolation
                               └─► hudBridge ─(diff + throttle)─► Pinia hud store ─► HUD components
Keyboard ─► input.ts ─► GameClient (60 Hz sim tick) ─► CMD ─► Socket
```

- `GameClient` is created in `GameCanvas`'s `onMounted` and destroyed in `onBeforeUnmount`. It is stored with `markRaw` so Vue never wraps it in a proxy.
- The **client sim tick (60 Hz)** runs on a fixed-step accumulator inside the rAF loop. It does not use `setInterval`. When the tab is hidden, rAF stops, the client notices the gap and resyncs from the next snapshot.

### 5.4 Client event handling

This follows the rules in [Events & Messaging §3.2](./EVENTS-AND-MESSAGING.md#32-client-side-best-practices-applied).

```ts
// game/events/EventDispatcher.ts (sketch)
export class EventDispatcher {
  private lastSeq = 0
  private subs = new Set<(e: GameEvent, tick: number) => void>()

  onFrame(firstSeq: number, tick: number, events: GameEvent[]) {
    let seq = firstSeq
    for (const e of events) {
      if (seq <= this.lastSeq) { seq++; continue }            // duplicate (replay) → ignore
      if (seq !== this.lastSeq + 1) return this.requestResync() // gap → FULL_STATE
      applyEvent(this.world, e)                                 // 1. the only state mutation
      for (const s of this.subs) s(e, tick)                     // 2. read-only presentation
      this.lastSeq = seq++
    }
  }
  subscribe(fn: (e: GameEvent, tick: number) => void) { this.subs.add(fn); return () => this.subs.delete(fn) }
}
```

| Subscriber | Reacts to | Does |
|---|---|---|
| `EffectsSystem` | `BOMB_EXPLODED`, `WALL_DESTROYED`, `ALIEN_KILLED`, `PLAYER_ELIMINATED` | Spawns pooled sprite effects, scheduled by `tick` |
| `AudioSystem` | Almost all | Plays SFX with distance falloff |
| `PredictionSystem` | `BOMB_PLACED` (own `cmdSeq`), private `BOMB_REJECTED` | Confirms or removes pending bombs |
| `HudBridge` | `PLAYER_HIT`, `ITEM_TAKEN`, `PLAYER_ELIMINATED`, `ALIEN_KILLED` | Throttled push into the `hud` store and kill feed |
| `A11yAnnouncer` | Eliminations, match end | Writes text to the ARIA live region |

- `lastSeq` is kept across reconnects, and `arena.resume` sends it to the server.
- The subscribers never mutate `world`. Unit tests feed recorded event streams into the dispatcher and assert both the resulting world state and the subscriber calls.

---

## 6. Game Canvas Rendering

### 6.1 Scaling

- Sprites are drawn at **16×16 px** per tile, so the arena is 21 × 16 = 336 px at 1×.
- The renderer picks the largest **integer scale** that fits the available area: 2× = 672 px, 3× = 1008 px, 4× = 1344 px. It sets `imageSmoothingEnabled = false` and accounts for `devicePixelRatio` so pixels stay crisp.
- Below a 2× fit (a very small window), it falls back to fractional scaling with smoothing off and shows a "best at ≥ 1024×768" hint.

### 6.2 Layers (drawn bottom → top)

| # | Layer | Content | Redraw |
|---|---|---|---|
| 1 | **Static** | Floor + hard walls, pre-rendered once into an offscreen canvas | Once per match (and on sudden-death tiles) |
| 2 | Soft walls | Destructible blocks, crumble animation on destroy | On change, then blit |
| 3 | Floor items | Collectibles (bobbing + glow), alien portals | Every frame |
| 4 | Bombs | Pulse animation, flashing faster in the last 0.5 s. Pending (predicted) bombs at 60 % opacity | Every frame |
| 5 | Fire | Center/arm/end sprites, 0.5 s fade | Every frame |
| 6 | Entities | Aliens, then players (y-sorted), blinking while invulnerable, walk cycles | Every frame |
| 7 | Effects | Hit sparks, pickup "+1" floaters, death puff, screen-edge damage flash | Every frame |
| 8 | Labels | Player names above sprites (toggleable) | Every frame |

- **Danger preview (optional setting):** tiles inside the blast lines of bombs with less than 1 s of fuse left get a faint red tint. This makes danger readable, and it uses the same rule as the Seeker AI.
- Performance target: < 2 ms of render time per frame on a mid-range laptop, so there is room for 60 FPS.

### 6.3 Visual style

| Element | Look |
|---|---|
| Theme | Dark UI (`#12141c` background, `#1d2130` panels), neon accent `#ffcc33` |
| Fonts | "Press Start 2P" for titles and the timer, "Inter" for body text and tables |
| Player colors (Okabe-Ito, colorblind-safe) | P1 blue `#0072B2`, P2 orange `#E69F00`, P3 green `#009E73`, P4 pink `#CC79A7`. Each player also has a unique **helmet shape** so they can be told apart without color. |
| Hard wall | Grey stone block with a bevel |
| Soft wall | Brown bricks with a crack animation on hit |
| Collectibles | ❤ red heart, 🔥 orange flame, 💣 black bomb with a "+", on a glowing round badge |
| Drifter | Green blob, wobbling idle animation |
| Seeker | Purple floating eye, which **turns red and leaves a trail when it locks on** to a player |
| Brute | Red armored beast with 3 armor pips that crack as it loses HP. **Glowing eyes and a lock-on line** while hunting. |
| Alien danger halo | A faint pulsing red tile under every alien, because contact is lethal |
| Alien portal | A swirling ring in the alien type's color, growing over 1.5 s |
| Sudden death | Screen border pulses red, falling-block shadow appears 0.5 s before impact |

### 6.4 Assets

- One **sprite atlas** (`atlas.png` + `atlas.json`, TexturePacker or free-tex-packer format) is loaded before entering an arena and cached by a service worker.
- Total target size is ≤ 500 KB for sprites and SFX.

---

## 7. Input Handling

- `keydown`/`keyup` listeners go on `window` while `GameStage` is mounted. They are **ignored while focus is in an input field** or a modal is open.
- `preventDefault()` is called on SPACE and arrow keys so the page does not scroll.
- **Held-direction stack:** pressed directions are pushed onto a stack and removed on release. The top of the stack is the current direction, so the most recent key wins (spec §4.3).
- **Bomb:** edge-triggered. A press sets the bomb bit in the **next client sim tick's** command. OS key-repeat events (`event.repeat`) are ignored.
- **On `blur` or `visibilitychange`,** all keys are cleared, so the player does not keep walking after an alt-tab.
- Key bindings come from the `settings` store. Defaults: Arrows + WASD for moving, SPACE for bombs, ESC for the menu.
- *(v1.1)* Gamepad API support: d-pad/stick for movement, A for bombs.

---

## 8. Audio

| Event | SFX |
|---|---|
| Bomb placed | Soft "thunk" |
| Fuse (last 0.5 s) | Rising hiss |
| Explosion | Boom, with volume falling off by distance from the own player |
| Wall destroyed | Crumble |
| Pickup | Rising "bling", a different pitch per collectible type |
| Hit / eliminated | Hurt grunt / sad jingle |
| Alien portal / alien killed | Warble / splat |
| Countdown / GO / win | Beeps / horn / fanfare |

- Lobby music and a match music loop that speeds up in sudden death.
- Audio unlocks on the first user gesture (browser autoplay policy).

---

## 9. Connection & Error UX

| Situation | UI |
|---|---|
| Ping < 60 / 60–120 / > 120 ms | `PingBadge` green / yellow / red |
| Snapshot stall > 250 ms | Small "⚠ connection unstable" icon next to the ping |
| Reconnecting | Silent for 1 s, then a `ReconnectOverlay` with a spinner and the "15 s" grace countdown |
| Resume failed / eliminated while away | Toast plus return to the Waiting Room |
| Server draining | Toast "Server maintenance: moving you to a new arena…" and automatic Quick Play |
| Protocol mismatch (close 4001) | Modal "A new version is available" with a [Reload] button |
| REST errors | Inline form errors, generic toast for 5xx |

---

## 10. Performance Budget (client)

| Metric | Target |
|---|---|
| JS bundle (gzipped, excluding assets) | ≤ 300 KB. Lobby/profile and game are code-split. |
| Time to interactive (landing, 4G) | ≤ 2.5 s |
| Frame time (render + sim) | ≤ 4 ms p95 at 60 FPS |
| Allocations in the game loop | Close to zero: pooled objects, no per-frame arrays or closures |
| Memory | ≤ 150 MB tab heap |

---

## 11. Accessibility & i18n

- Colorblind-safe default palette plus shape-coded helmets. An alternative high-contrast palette is available in settings.
- Remappable keys, and every menu works with the keyboard and has visible focus rings.
- The **reduced motion** setting disables screen flashes and shake and shortens animations. It also follows `prefers-reduced-motion`.
- HUD and menu text meet WCAG AA contrast. Important events are announced to screen readers through an ARIA live region (e.g. "Kate eliminated", "Match over: Andrew wins").
- All strings live in `i18n/en.json`, and dates and numbers are formatted with `Intl`.

---

## 12. Testing

| Level | What |
|---|---|
| Unit (Vitest) | Codec against golden vectors, prediction subset (`sim/`) against the Go-generated rule vectors, tick for tick, prediction reconciliation, interpolation timing, input stack, hudBridge throttling |
| Component (Vue Test Utils) | Forms, ArenaTable live updates, WaitingRoom host/ready logic, RoundEndOverlay, MatchEndOverlay (tiebreak display, rating states) |
| E2E (Playwright) | Guest → Quick Play → 2-client match → results. Same flow under 100 ms ± 20 ms with 1 % loss (see Server & Network §9.2). |
| Visual | Playwright screenshot tests of lobby, HUD and results (canvas excluded, or seeded with a fixed state) |

---

## 13. GUI Milestones (part of M4 in the main spec)

| Step | Deliverable |
|---|---|
| G1 | App shell, routing, theme, Landing + auth/guest modals |
| G2 | `GameClient` + Canvas renderer with placeholder squares, input, local prediction against a dev server |
| G3 | Lobby (live list, Quick Play, Create, Join by code, region ping) |
| G4 | Waiting room, countdown, HUD, kill feed, results |
| G5 | Sprite atlas, animations, effects, audio |
| G6 | Settings (keys, audio, display, network), reconnect UX, accessibility pass |
| G7 | Profile page (rating chart), leaderboard, ranked UI (badges, results deltas, `rating.updated`), performance pass, E2E suite |
