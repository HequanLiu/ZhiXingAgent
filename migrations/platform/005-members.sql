CREATE TABLE IF NOT EXISTS tenant_members(
 tenant text NOT NULL,actor text NOT NULL,display_name text NOT NULL,
 role text NOT NULL CHECK(role IN ('manager','member')),enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),PRIMARY KEY(tenant,actor)
);
CREATE TABLE IF NOT EXISTS member_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,actor text NOT NULL,
 target_actor text NOT NULL,before_data jsonb,after_data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION guard_member_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'member audit immutable'; END; $$;
DROP TRIGGER IF EXISTS guard_member_audit ON member_audit;
CREATE TRIGGER guard_member_audit BEFORE UPDATE OR DELETE ON member_audit FOR EACH ROW EXECUTE FUNCTION guard_member_audit();

ALTER TABLE IF EXISTS patrol_escalations ALTER COLUMN owner DROP DEFAULT;
