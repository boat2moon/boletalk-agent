CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "RagChunk" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "content" text NOT NULL,
  "embedding" vector(1024),
  "source" text NOT NULL,
  "category" text NOT NULL,
  "headerChain" text,
  "chunkIndex" integer,
  "metadata" jsonb,
  "createdAt" timestamp DEFAULT now()
);

-- 向量索引 (HNSW, 1024 维)
CREATE INDEX IF NOT EXISTS "idx_rag_embedding"
  ON "RagChunk" USING hnsw ("embedding" vector_cosine_ops);

-- 全文检索索引 (GIN)
CREATE INDEX IF NOT EXISTS "idx_rag_tsv"
  ON "RagChunk" USING gin (to_tsvector('simple', "content"));

-- 分类过滤索引
CREATE INDEX IF NOT EXISTS "idx_rag_category"
  ON "RagChunk" ("category");
