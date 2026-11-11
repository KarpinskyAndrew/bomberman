-- +goose Up
CREATE TABLE player_ratings (
  user_id        UUID        NOT NULL,
  rating         INT         NOT NULL DEFAULT 1200,
  peak_rating    INT         NOT NULL DEFAULT 1200,
  rated_matches  INT         NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_ratings_pkey               PRIMARY KEY (user_id),
  CONSTRAINT player_ratings_user_id_fkey       FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT player_ratings_rating_check       CHECK (rating >= 100),
  CONSTRAINT player_ratings_peak_check         CHECK (peak_rating >= rating AND peak_rating >= 1200),
  CONSTRAINT player_ratings_rated_matches_check CHECK (rated_matches >= 0)
);
-- Leaderboard page + rank: only players past placement (SPEC §5.4.1, §7)
CREATE INDEX player_ratings_leaderboard_idx
  ON player_ratings (rating DESC, user_id) WHERE rated_matches >= 10;

CREATE TABLE user_stats (
  user_id          UUID        NOT NULL,
  matches_played   INT         NOT NULL DEFAULT 0,
  matches_won      INT         NOT NULL DEFAULT 0,
  matches_drawn    INT         NOT NULL DEFAULT 0,
  forfeits         INT         NOT NULL DEFAULT 0,
  rounds_played    INT         NOT NULL DEFAULT 0,
  rounds_won       INT         NOT NULL DEFAULT 0,
  kills            INT         NOT NULL DEFAULT 0,
  alien_kills      INT         NOT NULL DEFAULT 0,
  walls_destroyed  INT         NOT NULL DEFAULT 0,
  powerups_taken   INT         NOT NULL DEFAULT 0,
  bombs_placed     INT         NOT NULL DEFAULT 0,
  deaths           INT         NOT NULL DEFAULT 0,
  deaths_by_alien  INT         NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_stats_pkey         PRIMARY KEY (user_id),
  CONSTRAINT user_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_stats_matches_check CHECK (
    matches_played >= 0 AND matches_won >= 0 AND matches_drawn >= 0 AND forfeits >= 0
    AND matches_won + matches_drawn <= matches_played AND forfeits <= matches_played),
  CONSTRAINT user_stats_rounds_check  CHECK (rounds_played >= 0 AND rounds_won BETWEEN 0 AND rounds_played),
  CONSTRAINT user_stats_counters_check CHECK (
    kills >= 0 AND alien_kills >= 0 AND walls_destroyed >= 0 AND powerups_taken >= 0 AND bombs_placed >= 0),
  CONSTRAINT user_stats_deaths_check  CHECK (deaths_by_alien BETWEEN 0 AND deaths AND deaths <= rounds_played)
);


-- +goose Down
DROP TABLE IF EXISTS user_stats;
DROP TABLE IF EXISTS player_ratings;
