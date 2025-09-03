-- Enable required PostgreSQL extensions for advanced search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop the B-tree index and create GIN index for JSONB metadata search
DROP INDEX IF EXISTS "documents_metadata_idx";
CREATE INDEX "documents_metadata_gin_idx" ON "documents" USING gin ("metadata");

-- Create TRGM GIN index for fuzzy text search on title
CREATE INDEX "documents_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);