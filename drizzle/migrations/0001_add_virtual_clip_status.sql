-- Migration: Add 'virtual' status to clip_status enum
-- Description: Supports on-demand clip streaming via media proxy instead of eager file generation

-- PostgreSQL requires creating a new enum type to add values
-- We'll use ALTER TYPE with ADD VALUE (available in PostgreSQL 9.1+)

-- Add 'virtual' as the first value in the enum
-- Note: 'BEFORE' requires PostgreSQL 12+, for older versions use different approach
ALTER TYPE clip_status ADD VALUE IF NOT EXISTS 'virtual' BEFORE 'pending';

-- Update existing clips with status 'pending' that have no file to 'virtual'
-- This handles any clips that were created but never processed
UPDATE clip
SET status = 'virtual'
WHERE status = 'pending' AND file_id IS NULL;

-- Change the default status for new clips from 'pending' to 'virtual'
-- Note: This is handled in the Drizzle schema, but we set it here for safety
ALTER TABLE clip ALTER COLUMN status SET DEFAULT 'virtual';

-- Add comment to explain the status meanings
COMMENT ON COLUMN clip.status IS 'Clip status: virtual (timestamp-only, streamed via proxy), pending (export queued), processing (generating file), completed (file exists), failed (export failed)';
