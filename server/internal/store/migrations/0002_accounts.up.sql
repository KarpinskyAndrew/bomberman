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
