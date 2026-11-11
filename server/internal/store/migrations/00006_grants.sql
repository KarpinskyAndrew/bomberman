-- Table privileges per DATABASE.md §1.3 / §7. Runs as migrator, which owns every table.
-- The login roles themselves are created by deploy/postgres/init/01-roles.sh.

-- +goose Up
-- Nobody but the named roles sees the schema; gameserver ends up with CONNECT only.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO api, worker;

-- api: owns accounts and the outbox, inserts the 1:1 components at registration,
-- anonymises match_players.display_name on account deletion (§6.2), reads the rest.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, user_credentials, refresh_tokens, outbox TO api;
GRANT SELECT, INSERT ON player_ratings, user_stats TO api;
GRANT SELECT ON matches, match_players, match_rounds, match_round_players,
                rating_history, processed_events TO api;
GRANT UPDATE (display_name) ON match_players TO api;
-- Tables added by later migrations are readable by api automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO api;

-- worker: persists matches and applies ratings and stats.
GRANT SELECT, INSERT, UPDATE ON matches, match_players, match_rounds, match_round_players,
                                rating_history, processed_events,
                                player_ratings, user_stats TO worker;
GRANT SELECT ON users TO worker;
-- Housekeeping (§6.1). The DELETE ... WHERE needs SELECT on the filtered columns too.
GRANT DELETE ON processed_events TO worker;
GRANT SELECT, DELETE ON outbox, refresh_tokens TO worker;

-- gameserver: nothing. LISTEN rating_updated needs no table privileges.

-- +goose Down
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM api;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM api, worker;
REVOKE ALL ON SCHEMA public FROM api, worker;
GRANT USAGE ON SCHEMA public TO PUBLIC;
