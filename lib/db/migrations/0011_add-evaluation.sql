CREATE TABLE IF NOT EXISTS "Evaluation" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chatId"    uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "userId"    uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "scores"    jsonb NOT NULL,
  "comments"  jsonb NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("chatId")
);
