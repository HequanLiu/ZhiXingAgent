-- apps/platform-worker/jobs.ts
CREATE TABLE IF NOT EXISTS analysis_jobs(
    event_id text PRIMARY KEY,tenant text NOT NULL,object_id text NOT NULL,version integer NOT NULL,
    status text NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    summary text,observed_version integer,provider text,model text,run_id text,receipts jsonb,error_code text);
    ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS claim_token text;
    ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS usage jsonb;
    CREATE TABLE IF NOT EXISTS analysis_retry_audit(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event_id text NOT NULL,tenant text NOT NULL,actor text NOT NULL,
      retried_at timestamptz NOT NULL DEFAULT clock_timestamp(),previous_run jsonb NOT NULL);
    CREATE OR REPLACE FUNCTION reject_analysis_retry_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'analysis retry audit is immutable'; END; $$;
    DROP TRIGGER IF EXISTS analysis_retry_audit_immutable ON analysis_retry_audit;
    CREATE TRIGGER analysis_retry_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON analysis_retry_audit
      FOR EACH STATEMENT EXECUTE FUNCTION reject_analysis_retry_audit_change();
    CREATE TABLE IF NOT EXISTS worker_status(name text PRIMARY KEY,model text NOT NULL,enabled boolean NOT NULL,heartbeat_at timestamptz NOT NULL);

-- apps/platform-worker/patrol.ts
CREATE TABLE IF NOT EXISTS patrol_policy(tenant text PRIMARY KEY,version integer NOT NULL,policy jsonb NOT NULL,next_run_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS patrol_runs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,policy_version integer NOT NULL,object_count integer NOT NULL,issue_count integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS patrol_inbox(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,object_id text NOT NULL,source_version integer NOT NULL,issue_key text NOT NULL,owner text NOT NULL,summary text NOT NULL,business_date date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant,object_id,issue_key,business_date));

-- apps/platform-api/auth.ts
CREATE TABLE IF NOT EXISTS auth_users(tenant text NOT NULL,username text NOT NULL,actor text NOT NULL,salt text NOT NULL,password_hash text NOT NULL,enabled boolean NOT NULL DEFAULT true,PRIMARY KEY(tenant,username));
 CREATE TABLE IF NOT EXISTS auth_sessions(token_hash text PRIMARY KEY,tenant text NOT NULL,username text NOT NULL,expires_at timestamptz NOT NULL,FOREIGN KEY(tenant,username) REFERENCES auth_users(tenant,username));

-- apps/platform-api/exceptions.ts
CREATE TABLE IF NOT EXISTS platform_exceptions(tenant text NOT NULL,id text NOT NULL,object_id text NOT NULL,issue_key text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(tenant,id),UNIQUE(tenant,object_id,issue_key));CREATE TABLE IF NOT EXISTS exception_sources(tenant text NOT NULL,object_id text NOT NULL,version integer NOT NULL,PRIMARY KEY(tenant,object_id));ALTER TABLE exception_sources ADD COLUMN IF NOT EXISTS observed_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z';CREATE TABLE IF NOT EXISTS exception_mutations(tenant text NOT NULL,key text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(tenant,key));

-- apps/platform-worker/runtime-settings.ts
CREATE TABLE IF NOT EXISTS runtime_settings(
    tenant text PRIMARY KEY CHECK(tenant='demo'),version integer NOT NULL DEFAULT 0,settings jsonb,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
    INSERT INTO runtime_settings(tenant) VALUES('demo') ON CONFLICT(tenant) DO NOTHING;
    CREATE TABLE IF NOT EXISTS runtime_settings_audit(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,actor text NOT NULL,
      request_key text NOT NULL,request_hash text NOT NULL,version integer NOT NULL,
      previous_settings jsonb,new_settings jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(tenant,actor,request_key));
    CREATE OR REPLACE FUNCTION reject_runtime_settings_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'runtime settings audit is immutable'; END; $$;
    DROP TRIGGER IF EXISTS runtime_settings_audit_immutable ON runtime_settings_audit;
    CREATE TRIGGER runtime_settings_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON runtime_settings_audit
      FOR EACH STATEMENT EXECUTE FUNCTION reject_runtime_settings_audit_change();

-- apps/platform-api/channel.ts
CREATE TABLE IF NOT EXISTS channel_identities(channel text NOT NULL,sender_id text NOT NULL,tenant text NOT NULL,actor text NOT NULL,PRIMARY KEY(channel,sender_id));
 CREATE TABLE IF NOT EXISTS channel_events(channel text NOT NULL,event_id text NOT NULL,fingerprint text NOT NULL,tenant text NOT NULL,actor text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(channel,event_id));

CREATE TABLE IF NOT EXISTS activity(sequence bigserial PRIMARY KEY,event_id text UNIQUE NOT NULL,tenant text NOT NULL,object_id text NOT NULL,version integer NOT NULL,summary text NOT NULL,created_at timestamptz DEFAULT now()); CREATE TABLE IF NOT EXISTS worker_cursor(name text PRIMARY KEY,value bigint NOT NULL);
