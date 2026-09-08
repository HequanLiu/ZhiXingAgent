ALTER TABLE chat_messages ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]'::jsonb;
