CREATE TABLE IF NOT EXISTS scenario_installations(tenant text NOT NULL,scenario text NOT NULL,manifest_version text NOT NULL,version integer NOT NULL,config jsonb NOT NULL,PRIMARY KEY(tenant,scenario));
 CREATE TABLE IF NOT EXISTS installation_audit(id bigserial PRIMARY KEY,tenant text NOT NULL,scenario text NOT NULL,actor text NOT NULL,previous_config jsonb,new_config jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS installation_mutations(tenant text NOT NULL,key text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(tenant,key));
