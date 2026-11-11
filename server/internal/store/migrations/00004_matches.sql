-- +goose Up
CREATE TABLE matches (
  id                UUID        NOT NULL,
  arena_id          TEXT        NOT NULL,
  arena_name        TEXT        NOT NULL,
  region            TEXT        NOT NULL,
  sim_version       TEXT        NOT NULL,
  mode              TEXT        NOT NULL,
  private           BOOLEAN     NOT NULL,
  ruleset           TEXT        NOT NULL,
  best_of           SMALLINT    NOT NULL,
  arena_size        SMALLINT    NOT NULL,
  wall_density_pct  SMALLINT    NOT NULL,
  wall_drop_pct     SMALLINT    NOT NULL,
  aliens_enabled    BOOLEAN     NOT NULL,
  max_aliens        SMALLINT    NOT NULL,
  rounds_played     SMALLINT    NOT NULL,
  result            TEXT        NOT NULL,
  rated             BOOLEAN     NOT NULL DEFAULT false,
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ NOT NULL,
  duration_ms       INT         NOT NULL,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matches_pkey              PRIMARY KEY (id),
  CONSTRAINT matches_arena_check       CHECK (length(arena_id) BETWEEN 1 AND 16 AND length(arena_name) BETWEEN 1 AND 32),
  CONSTRAINT matches_region_check      CHECK (region ~ '^europe-[a-z]+[0-9]+$'),
  CONSTRAINT matches_sim_version_check CHECK (length(sim_version) BETWEEN 1 AND 64),
  CONSTRAINT matches_mode_check        CHECK (mode IN ('ranked', 'unrated')),
  CONSTRAINT matches_ruleset_check     CHECK (ruleset IN ('standard', 'custom')),
  CONSTRAINT matches_result_check      CHECK (result IN ('win', 'draw')),
  -- Ranked is always best-of-3, unrated always a single round (SPEC §4.8.3)
  CONSTRAINT matches_format_check      CHECK ((mode = 'ranked' AND best_of = 3) OR (mode = 'unrated' AND best_of = 1)),
  CONSTRAINT matches_rounds_check      CHECK (rounds_played BETWEEN 1 AND best_of),
  CONSTRAINT matches_rule_values_check CHECK (
    arena_size IN (15, 17, 21)
    AND wall_density_pct BETWEEN 40 AND 85 AND wall_drop_pct BETWEEN 0 AND 60 AND max_aliens BETWEEN 0 AND 8),
  -- 'standard' means exactly the locked map rules (SPEC §5.4.2 item 2); the format follows the mode
  CONSTRAINT matches_standard_ruleset_check CHECK (
    ruleset <> 'standard' OR (arena_size = 15 AND wall_density_pct = 65 AND wall_drop_pct = 30
                              AND aliens_enabled AND max_aliens = 2)),
  -- Ranked arenas are public and use the standard ruleset (SPEC §5.1, §5.4.2)
  CONSTRAINT matches_ranked_check      CHECK (mode <> 'ranked' OR (ruleset = 'standard' AND NOT private)),
  -- Only ranked matches can be rated
  CONSTRAINT matches_rated_check       CHECK (NOT rated OR mode = 'ranked'),
  CONSTRAINT matches_timing_check      CHECK (ended_at >= started_at AND duration_ms >= 0)
);
-- "recent matches" / admin views, housekeeping by age
CREATE INDEX matches_ended_at_idx ON matches (ended_at DESC);

CREATE TABLE match_players (
  match_id         UUID     NOT NULL,
  slot             SMALLINT NOT NULL,
  user_id          UUID     NULL,
  display_name     TEXT     NOT NULL,
  placement        SMALLINT NOT NULL,
  round_wins       SMALLINT NOT NULL DEFAULT 0,
  round_points     SMALLINT NOT NULL DEFAULT 0,
  forfeited        BOOLEAN  NOT NULL DEFAULT false,
  kills            SMALLINT NOT NULL DEFAULT 0,
  alien_kills      SMALLINT NOT NULL DEFAULT 0,
  walls_destroyed  SMALLINT NOT NULL DEFAULT 0,
  powerups_taken   SMALLINT NOT NULL DEFAULT 0,
  bombs_placed     SMALLINT NOT NULL DEFAULT 0,
  rating_before    INT      NULL,
  rating_after     INT      NULL,
  CONSTRAINT match_players_pkey              PRIMARY KEY (match_id, slot),
  CONSTRAINT match_players_match_user_key    UNIQUE (match_id, user_id),  -- a user holds at most one slot; NULLs (guests) are distinct
  CONSTRAINT match_players_match_id_fkey     FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT match_players_user_id_fkey      FOREIGN KEY (user_id)  REFERENCES users (id)   ON DELETE SET NULL,
  CONSTRAINT match_players_slot_check        CHECK (slot BETWEEN 1 AND 4),
  CONSTRAINT match_players_display_name_check CHECK (length(display_name) BETWEEN 1 AND 32),
  CONSTRAINT match_players_standing_check    CHECK (
    placement BETWEEN 1 AND 4 AND round_wins BETWEEN 0 AND 2 AND round_points BETWEEN 0 AND 9),
  CONSTRAINT match_players_counters_check    CHECK (
    kills >= 0 AND alien_kills >= 0 AND walls_destroyed >= 0 AND powerups_taken >= 0 AND bombs_placed >= 0),
  -- both-or-neither written with IS NULL on both sides, so the check can never evaluate to NULL (see §3.9 "NULL trap")
  CONSTRAINT match_players_rating_check      CHECK (
    (rating_before IS NULL) = (rating_after IS NULL)
    AND (rating_before IS NULL OR (rating_before >= 100 AND rating_after >= 100)))
);
-- Match history of a user, newest first: match_id is UUIDv7 (time-ordered), so no join is needed to sort
CREATE INDEX match_players_user_id_idx ON match_players (user_id, match_id DESC) WHERE user_id IS NOT NULL;

CREATE TABLE match_rounds (
  match_id       UUID        NOT NULL,
  round_no       SMALLINT    NOT NULL,
  seed           BIGINT      NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  duration_ms    INT         NOT NULL,
  end_tick       INT         NOT NULL,
  result         TEXT        NOT NULL,
  end_reason     TEXT        NOT NULL,
  winner_slot    SMALLINT    NULL,
  input_log_uri  TEXT        NULL,
  CONSTRAINT match_rounds_pkey             PRIMARY KEY (match_id, round_no),
  CONSTRAINT match_rounds_match_id_fkey    FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT match_rounds_winner_fkey      FOREIGN KEY (match_id, winner_slot) REFERENCES match_players (match_id, slot),
  CONSTRAINT match_rounds_round_no_check   CHECK (round_no BETWEEN 1 AND 3),
  CONSTRAINT match_rounds_timing_check     CHECK (duration_ms BETWEEN 0 AND 200000 AND end_tick >= 0),
  CONSTRAINT match_rounds_result_check     CHECK (result IN ('win', 'draw')),
  CONSTRAINT match_rounds_end_reason_check CHECK (end_reason IN ('last_standing', 'timeout_hp', 'simultaneous')),
  CONSTRAINT match_rounds_winner_check     CHECK ((result = 'win') = (winner_slot IS NOT NULL)),
  CONSTRAINT match_rounds_simultaneous_check CHECK (end_reason <> 'simultaneous' OR result = 'draw'),
  CONSTRAINT match_rounds_input_log_check  CHECK (input_log_uri IS NULL OR input_log_uri LIKE 'gs://%')
);

CREATE TABLE match_round_players (
  match_id         UUID     NOT NULL,
  round_no         SMALLINT NOT NULL,
  slot             SMALLINT NOT NULL,
  placement        SMALLINT NOT NULL,
  points           SMALLINT NOT NULL,
  hp_left          SMALLINT NOT NULL,
  eliminated_tick  INT      NULL,
  death_cause      TEXT     NULL,
  killer_slot      SMALLINT NULL,
  alien_type       TEXT     NULL,
  kills            SMALLINT NOT NULL DEFAULT 0,
  alien_kills      SMALLINT NOT NULL DEFAULT 0,
  walls_destroyed  SMALLINT NOT NULL DEFAULT 0,
  powerups_taken   SMALLINT NOT NULL DEFAULT 0,
  bombs_placed     SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT match_round_players_pkey        PRIMARY KEY (match_id, round_no, slot),
  CONSTRAINT match_round_players_round_fkey  FOREIGN KEY (match_id, round_no)    REFERENCES match_rounds (match_id, round_no) ON DELETE CASCADE,
  CONSTRAINT match_round_players_player_fkey FOREIGN KEY (match_id, slot)        REFERENCES match_players (match_id, slot)    ON DELETE CASCADE,
  CONSTRAINT match_round_players_killer_fkey FOREIGN KEY (match_id, killer_slot) REFERENCES match_players (match_id, slot),
  CONSTRAINT match_round_players_standing_check CHECK (
    placement BETWEEN 1 AND 4 AND points BETWEEN 0 AND 3 AND hp_left BETWEEN 0 AND 5),
  CONSTRAINT match_round_players_death_cause_check CHECK (
    death_cause IN ('bomb', 'alien', 'wall', 'disconnect', 'forfeit')),
  CONSTRAINT match_round_players_alien_type_check CHECK (alien_type IN ('drifter', 'seeker', 'brute')),
  -- eliminated ⇔ has a cause; survivors have HP left
  CONSTRAINT match_round_players_elimination_check CHECK (
    (eliminated_tick IS NULL) = (death_cause IS NULL)
    AND (eliminated_tick IS NULL OR eliminated_tick >= 0)
    AND (eliminated_tick IS NOT NULL OR hp_left > 0)),
  CONSTRAINT match_round_players_killer_check CHECK (killer_slot IS NULL OR death_cause IS NOT DISTINCT FROM 'bomb'),
  CONSTRAINT match_round_players_alien_check  CHECK ((death_cause IS NOT DISTINCT FROM 'alien') = (alien_type IS NOT NULL)),
  CONSTRAINT match_round_players_counters_check CHECK (
    kills >= 0 AND alien_kills >= 0 AND walls_destroyed >= 0 AND powerups_taken >= 0 AND bombs_placed >= 0)
);

CREATE TABLE rating_history (
  user_id        UUID        NOT NULL,
  match_id       UUID        NOT NULL,
  rating_before  INT         NOT NULL,
  rating_after   INT         NOT NULL,
  delta          INT         NOT NULL,
  k_factor       SMALLINT    NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rating_history_pkey          PRIMARY KEY (user_id, match_id),
  CONSTRAINT rating_history_user_id_fkey  FOREIGN KEY (user_id)  REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT rating_history_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT rating_history_rating_check  CHECK (rating_before >= 100 AND rating_after >= 100),
  CONSTRAINT rating_history_delta_check   CHECK (delta = rating_after - rating_before),
  CONSTRAINT rating_history_k_check       CHECK (k_factor IN (16, 24, 40))
);
-- Rating chart (ProfileService.GetRatingHistory), newest first
CREATE INDEX rating_history_user_created_idx ON rating_history (user_id, created_at DESC);
-- FK index for the matches cascade; also "who was rated in this match"
CREATE INDEX rating_history_match_id_idx     ON rating_history (match_id);

-- +goose Down
DROP TABLE IF EXISTS rating_history;
DROP TABLE IF EXISTS match_round_players;
DROP TABLE IF EXISTS match_rounds;
DROP TABLE IF EXISTS match_players;
DROP TABLE IF EXISTS matches;