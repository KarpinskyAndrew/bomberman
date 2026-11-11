-- +goose Up
CREATE TABLE users (
    id              UUID        NOT NULL,
    username        CITEXT      NOT NULL,
    email           CITEXT      NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ NULL,
    CONSTRAINT      users_pkey      PRIMARY KEY(id),
    CONSTRAINT      users_username_key  UNIQUE(username),
    CONSTRAINT      users_email_key     UNIQUE(email),
    CONSTRAINT users_username_check CHECK (username ~ '^[A-Za-z0-9_]{3,16}$'),
    CONSTRAINT users_email_check    CHECK (length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+$')
  );

CREATE TABLE user_credentials (
  user_id              UUID        NOT NULL,
  password_hash        TEXT        NOT NULL,
  password_changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_credentials_pkey         PRIMARY KEY (user_id),
  CONSTRAINT user_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_credentials_hash_check   CHECK (password_hash LIKE '$argon2id$%' OR password_hash LIKE '$2_$%')
);

CREATE TABLE refresh_tokens (
  id           UUID        NOT NULL,
  user_id      UUID        NOT NULL,
  family_id    UUID        NOT NULL,
  token_hash   BYTEA       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ NULL,
  replaced_by  UUID        NULL,
  CONSTRAINT refresh_tokens_pkey             PRIMARY KEY (id),
  CONSTRAINT refresh_tokens_token_hash_key   UNIQUE (token_hash),
  CONSTRAINT refresh_tokens_user_id_fkey     FOREIGN KEY (user_id)     REFERENCES users (id)          ON DELETE CASCADE,
  CONSTRAINT refresh_tokens_replaced_by_fkey FOREIGN KEY (replaced_by) REFERENCES refresh_tokens (id) ON DELETE SET NULL,
  CONSTRAINT refresh_tokens_token_hash_check CHECK (octet_length(token_hash) = 32),
  CONSTRAINT refresh_tokens_expiry_check     CHECK (expires_at > created_at),
  CONSTRAINT refresh_tokens_replaced_check   CHECK (replaced_by IS NULL OR revoked_at IS NOT NULL)
);
-- "log out everywhere" / per-user revocation; FK index
CREATE INDEX refresh_tokens_user_id_idx    ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
-- revoke a whole family on reuse detection
CREATE INDEX refresh_tokens_family_id_idx  ON refresh_tokens (family_id);
-- FK index for the self-reference (rarely used, keeps ON DELETE SET NULL cheap)
CREATE INDEX refresh_tokens_replaced_by_idx ON refresh_tokens (replaced_by) WHERE replaced_by IS NOT NULL;
-- housekeeping
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);

-- +goose Down
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS user_credentials;
DROP TABLE IF EXISTS users;