CREATE TABLE chat_messages (
 id text PRIMARY KEY, tenant text NOT NULL, actor text NOT NULL, message text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','completed','failed')),
 answer text, model text, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_owner_history ON chat_messages(tenant,actor,created_at);
CREATE UNIQUE INDEX chat_owner_pending ON chat_messages(tenant,actor) WHERE status IN ('queued','running');
