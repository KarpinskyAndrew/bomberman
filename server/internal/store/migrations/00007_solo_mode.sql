-- Solo mode (SPEC §4.9): one player against the aliens. DATABASE.md 0.4.
-- Every CHECK below only widens what the old one allowed, so the previous release keeps working.

-- +goose Up
-- matches: mode 'solo', result 'loss' (a solo run has no opponent, so a lost run has no winner)
ALTER TABLE matches
  DROP CONSTRAINT matches_mode_check,
  ADD  CONSTRAINT matches_mode_check   CHECK (mode IN ('ranked', 'unrated', 'solo')),
  DROP CONSTRAINT matches_result_check,
  ADD  CONSTRAINT matches_result_check CHECK (result IN ('win', 'draw', 'loss')),
  -- Ranked is best-of-3; unrated and solo are a single round
  DROP CONSTRAINT matches_format_check,
  ADD  CONSTRAINT matches_format_check CHECK (
    (mode = 'ranked' AND best_of = 3) OR (mode IN ('unrated', 'solo') AND best_of = 1)),
  -- A solo arena is never listed or joinable, and it always has aliens
  ADD  CONSTRAINT matches_solo_check   CHECK (mode <> 'solo' OR (private AND aliens_enabled AND max_aliens >= 1)),
  -- Solo ends in win or loss, never a draw; PvP ends in win or draw, never a loss
  ADD  CONSTRAINT matches_solo_result_check CHECK (
    CASE WHEN mode = 'solo' THEN result IN ('win', 'loss') ELSE result IN ('win', 'draw') END);

-- match_rounds: a solo round ends 'survived' (win) or 'eliminated' (loss)
ALTER TABLE match_rounds
  DROP CONSTRAINT match_rounds_result_check,
  ADD  CONSTRAINT match_rounds_result_check     CHECK (result IN ('win', 'draw', 'loss')),
  DROP CONSTRAINT match_rounds_end_reason_check,
  ADD  CONSTRAINT match_rounds_end_reason_check CHECK (
    end_reason IN ('last_standing', 'timeout_hp', 'simultaneous', 'survived', 'eliminated')),
  ADD  CONSTRAINT match_rounds_solo_end_check   CHECK (
    (end_reason = 'eliminated') = (result = 'loss') AND (end_reason <> 'survived' OR result = 'win'));

-- user_stats: solo totals, kept apart from the PvP record
ALTER TABLE user_stats
  ADD COLUMN solo_runs       INT NOT NULL DEFAULT 0,
  ADD COLUMN solo_wins       INT NOT NULL DEFAULT 0,
  ADD COLUMN solo_best_score INT NOT NULL DEFAULT 0,
  ADD CONSTRAINT user_stats_solo_check CHECK (
    solo_runs >= 0 AND solo_wins BETWEEN 0 AND solo_runs AND solo_best_score >= 0);

-- +goose Down
DELETE FROM matches WHERE mode = 'solo';  -- cascades to players, rounds and round players

ALTER TABLE user_stats
  DROP CONSTRAINT user_stats_solo_check,
  DROP COLUMN solo_best_score,
  DROP COLUMN solo_wins,
  DROP COLUMN solo_runs;

ALTER TABLE match_rounds
  DROP CONSTRAINT match_rounds_solo_end_check,
  DROP CONSTRAINT match_rounds_end_reason_check,
  ADD  CONSTRAINT match_rounds_end_reason_check CHECK (end_reason IN ('last_standing', 'timeout_hp', 'simultaneous')),
  DROP CONSTRAINT match_rounds_result_check,
  ADD  CONSTRAINT match_rounds_result_check     CHECK (result IN ('win', 'draw'));

ALTER TABLE matches
  DROP CONSTRAINT matches_solo_result_check,
  DROP CONSTRAINT matches_solo_check,
  DROP CONSTRAINT matches_format_check,
  ADD  CONSTRAINT matches_format_check CHECK ((mode = 'ranked' AND best_of = 3) OR (mode = 'unrated' AND best_of = 1)),
  DROP CONSTRAINT matches_result_check,
  ADD  CONSTRAINT matches_result_check CHECK (result IN ('win', 'draw')),
  DROP CONSTRAINT matches_mode_check,
  ADD  CONSTRAINT matches_mode_check   CHECK (mode IN ('ranked', 'unrated'));
