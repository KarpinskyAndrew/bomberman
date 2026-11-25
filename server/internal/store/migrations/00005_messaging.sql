-- +goose Up
CREATE TABLE processed_events (
  consumer      TEXT        NOT NULL,
  event_id      UUID        NOT NULL,
  event_type    TEXT        NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT processed_events_pkey             PRIMARY KEY (consumer, event_id),
  CONSTRAINT processed_events_consumer_check   CHECK (consumer ~ '^[a-z][a-z0-9-]{1,62}$'),
  CONSTRAINT processed_events_event_type_check CHECK (event_type ~ '^[a-z]+(\.[a-z_]+)+\.v[0-9]+$')
);
-- housekeeping: delete rows older than 30 days
CREATE INDEX processed_events_processed_at_idx ON processed_events (processed_at);

CREATE TABLE outbox (
  id            UUID        NOT NULL,
  topic         TEXT        NOT NULL,
  event_type    TEXT        NOT NULL,
  aggregate_id  UUID        NOT NULL,
  payload       JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ NULL,
  attempts      INT         NOT NULL DEFAULT 0,
  last_error    TEXT        NULL,
  CONSTRAINT outbox_pkey             PRIMARY KEY (id),
  CONSTRAINT outbox_topic_check      CHECK (topic ~ '^[a-z][a-z0-9-]{2,254}$'),
  CONSTRAINT outbox_event_type_check CHECK (event_type ~ '^[a-z]+(\.[a-z_]+)+\.v[0-9]+$'),
  CONSTRAINT outbox_payload_check    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT outbox_attempts_check   CHECK (attempts >= 0)
);
-- relay: SELECT … WHERE published_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED
CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;
-- housekeeping: delete rows published more than 7 days ago
CREATE INDEX outbox_published_at_idx ON outbox (published_at) WHERE published_at IS NOT NULL;


-- +goose Down
DROP TABLE IF EXISTS outbox ;
DROP TABLE IF EXISTS processed_events  ;