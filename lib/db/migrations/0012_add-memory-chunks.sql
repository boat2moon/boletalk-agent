CREATE TABLE IF NOT EXISTS "MemoryChunk" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"      uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "content"     text NOT NULL,
  "embedding"   vector(1024),
  "source"      text NOT NULL,
  "category"    text NOT NULL,
  "headerChain" text,
  "chunkIndex"  integer,
  "metadata"    jsonb,
  "createdAt"   timestamp DEFAULT now()
);

-- 用户级过滤索引
CREATE INDEX IF NOT EXISTS "idx_memory_user"
  ON "MemoryChunk" ("userId");

-- 向量索引 (HNSW, 1024 维)
CREATE INDEX IF NOT EXISTS "idx_memory_embedding"
  ON "MemoryChunk" USING hnsw ("embedding" vector_cosine_ops);

-- 全文检索索引 (GIN)
CREATE INDEX IF NOT EXISTS "idx_memory_tsv"
  ON "MemoryChunk" USING gin (to_tsvector('simple', "content"));

-- 用户+分类复合索引
CREATE INDEX IF NOT EXISTS "idx_memory_category"
  ON "MemoryChunk" ("userId", "category");
