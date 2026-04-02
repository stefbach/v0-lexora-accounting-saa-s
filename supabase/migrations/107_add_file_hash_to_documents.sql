-- Add file_hash column for content-based duplicate detection
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents (file_hash) WHERE file_hash IS NOT NULL;
