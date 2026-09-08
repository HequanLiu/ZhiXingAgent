-- apps/sample-reference-service/store.ts
CREATE TABLE IF NOT EXISTS orders(tenant text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(tenant,id));
    CREATE TABLE IF NOT EXISTS project_templates(tenant text NOT NULL,id text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(tenant,id));
    CREATE TABLE IF NOT EXISTS project_template_audit(sequence bigserial PRIMARY KEY,tenant text NOT NULL,template_id text NOT NULL,actor text NOT NULL,action text NOT NULL,before_data jsonb,after_data jsonb,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS mutations(tenant text NOT NULL, key text NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL, PRIMARY KEY(tenant,key));
    CREATE TABLE IF NOT EXISTS outbox(id text PRIMARY KEY, sequence bigserial UNIQUE NOT NULL, tenant text NOT NULL, object_id text NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- apps/sample-reference-service/changes.ts
CREATE TABLE IF NOT EXISTS change_plans(id text PRIMARY KEY,tenant text NOT NULL,order_id text NOT NULL,source_version integer NOT NULL,due text NOT NULL,extra_cost_cents bigint NOT NULL,reason text NOT NULL,proposed_by text NOT NULL,plan_version integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'proposed',decided_by text,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS change_invocations(id text PRIMARY KEY,tenant text NOT NULL,change_id text NOT NULL UNIQUE,key text NOT NULL,result jsonb NOT NULL,UNIQUE(tenant,key));
 CREATE OR REPLACE FUNCTION guard_change_content() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'change plan immutable'; END IF;
 IF ROW(NEW.id,NEW.tenant,NEW.order_id,NEW.source_version,NEW.due,NEW.extra_cost_cents,NEW.reason,NEW.proposed_by,NEW.plan_version,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.tenant,OLD.order_id,OLD.source_version,OLD.due,OLD.extra_cost_cents,OLD.reason,OLD.proposed_by,OLD.plan_version,OLD.created_at) THEN RAISE EXCEPTION 'change plan immutable'; END IF;
 RETURN NEW; END; $$;
 DROP TRIGGER IF EXISTS guard_change_content ON change_plans;CREATE TRIGGER guard_change_content BEFORE UPDATE OR DELETE ON change_plans FOR EACH ROW EXECUTE FUNCTION guard_change_content();
 CREATE OR REPLACE FUNCTION guard_change_invocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'change invocation immutable'; END; $$;
 DROP TRIGGER IF EXISTS guard_change_invocation ON change_invocations;CREATE TRIGGER guard_change_invocation BEFORE UPDATE OR DELETE ON change_invocations FOR EACH ROW EXECUTE FUNCTION guard_change_invocation();

-- apps/sample-reference-service/attachments.ts
CREATE TABLE IF NOT EXISTS sampling_attachments(id text PRIMARY KEY,tenant text NOT NULL,order_id text NOT NULL,node_id text NOT NULL,actor text NOT NULL,source_version integer NOT NULL,filename text NOT NULL,mime text NOT NULL,size integer NOT NULL CHECK(size>0 AND size<=2097152),sha256 text NOT NULL,uploaded_at timestamptz NOT NULL DEFAULT now(),data bytea NOT NULL,CHECK(octet_length(data)=size));
 CREATE INDEX IF NOT EXISTS sampling_attachments_order_idx ON sampling_attachments(tenant,order_id);
 CREATE OR REPLACE FUNCTION guard_sampling_attachment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'attachment immutable'; END; $$;
 DROP TRIGGER IF EXISTS guard_sampling_attachment ON sampling_attachments;CREATE TRIGGER guard_sampling_attachment BEFORE UPDATE OR DELETE ON sampling_attachments FOR EACH ROW EXECUTE FUNCTION guard_sampling_attachment();
