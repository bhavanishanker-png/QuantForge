CREATE ROLE qf_app        LOGIN PASSWORD 'app_pw';
CREATE ROLE qf_worker     LOGIN PASSWORD 'worker_pw';
CREATE ROLE qf_dispatcher LOGIN PASSWORD 'dispatcher_pw';
CREATE DATABASE quantforge;
\connect quantforge

CREATE TYPE job_status   AS ENUM ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED');
CREATE TYPE outbox_status AS ENUM ('PENDING','CLAIMED','PUBLISHED','DEAD');

CREATE TABLE background_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL,
  type             text NOT NULL,
  status           job_status NOT NULL DEFAULT 'QUEUED',
  payload          jsonb NOT NULL DEFAULT '{}',
  progress         numeric(5,2) NOT NULL DEFAULT 0,
  attempt          int NOT NULL DEFAULT 0,
  max_attempts     int NOT NULL DEFAULT 3,
  cancel_requested boolean NOT NULL DEFAULT false,
  heartbeat_at     timestamptz,
  error_code       text,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  finished_at      timestamptz
);
CREATE INDEX background_jobs_running_hb ON background_jobs (heartbeat_at) WHERE status = 'RUNNING';

-- Terminal states are final.
CREATE FUNCTION jobs_terminal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('COMPLETED','FAILED','CANCELLED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'job % is terminal (%)', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_terminal_guard BEFORE UPDATE ON background_jobs FOR EACH ROW EXECUTE FUNCTION jobs_terminal_guard();

CREATE TABLE outbox_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  job_id        uuid NOT NULL REFERENCES background_jobs(id),
  event_type    text NOT NULL,
  payload       jsonb NOT NULL,
  status        outbox_status NOT NULL DEFAULT 'PENDING',
  attempts      int NOT NULL DEFAULT 0,
  available_at  timestamptz NOT NULL DEFAULT now(),
  claimed_until timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
CREATE INDEX outbox_pending ON outbox_events (available_at) WHERE status IN ('PENDING','CLAIMED');

-- The "business effect" of a ping job. Exactly one row per job proves exactly-once effects.
CREATE TABLE ping_results (
  job_id     uuid PRIMARY KEY REFERENCES background_jobs(id),
  attempt    int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON background_jobs, outbox_events TO qf_app;
GRANT SELECT ON ping_results TO qf_app;
GRANT SELECT, UPDATE ON background_jobs TO qf_worker;
GRANT INSERT, SELECT ON ping_results TO qf_worker;
GRANT SELECT, UPDATE, INSERT ON outbox_events TO qf_dispatcher;
GRANT SELECT, UPDATE ON background_jobs TO qf_dispatcher;
