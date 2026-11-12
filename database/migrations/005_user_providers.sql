-- Migration 005: User Provider Settings & Secure API Keys
-- Allows each user (admin and standard users) to choose between default RAG chunking or Gemini API.
-- Keys are encrypted at rest with AES-256-GCM and hashed with SHA-256.
-- Plaintext keys are never stored, retrievable, or visible in the database or UI.

CREATE TABLE IF NOT EXISTS user_providers (
    user_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    provider_mode VARCHAR(20) NOT NULL DEFAULT 'default', -- 'default' (extractive chunk RAG) or 'gemini'
    encrypted_key TEXT,                                  -- AES-256-GCM ciphertext (iv:authTag:cipher)
    key_hash VARCHAR(64),                                -- SHA-256 hash of plaintext key
    key_preview VARCHAR(40),                             -- Masked preview e.g. AIza••••••••••••••••••••••••4x9Q
    model_name VARCHAR(100) NOT NULL DEFAULT 'gemini-2.5-flash',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_providers_user_id ON user_providers(user_id);
