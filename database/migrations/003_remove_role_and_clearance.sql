-- Migration 003: Remove Role and Clearance completely
ALTER TABLE users DROP COLUMN IF EXISTS role CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS clearance_level CASCADE;
ALTER TABLE engineering_documents DROP COLUMN IF EXISTS clearance_required CASCADE;

