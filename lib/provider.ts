// ============================================================================
// Model Provider & API Key Management Service
// - Handles user provider preferences (default pgvector RAG chunking vs Gemini API)
// - Cryptographically isolates user keys with AES-256-GCM + SHA-256
// - Enforces safe reads: neither admin nor regular user can view the raw API key
// ============================================================================

import { dbQuery, dbQueryOne } from './pg';
import { encryptKey, decryptKey, hashKey, maskKey } from './provider-crypto';

export type ProviderMode = 'default' | 'gemini';

export interface SafeUserProvider {
  mode: ProviderMode;
  hasKey: boolean;
  keyPreview: string | null;
  keyHash: string | null;
  modelName: string;
}

interface UserProviderRow {
  user_id: number;
  provider_mode: string;
  encrypted_key: string | null;
  key_hash: string | null;
  key_preview: string | null;
  model_name: string;
  updated_at: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Returns safe provider metadata for the given user.
 * Plaintext keys and raw encrypted ciphertexts are NEVER returned.
 */
export async function getUserProviderSafe(userId: number): Promise<SafeUserProvider> {
  const row = await dbQueryOne<UserProviderRow>(
    `SELECT user_id, provider_mode, key_hash, key_preview, model_name
       FROM user_providers
      WHERE user_id = $1`,
    [userId],
    `PROVIDER: read safe provider config for user #${userId}`
  );

  if (!row) {
    return {
      mode: 'default',
      hasKey: false,
      keyPreview: null,
      keyHash: null,
      modelName: DEFAULT_MODEL,
    };
  }

  return {
    mode: (row.provider_mode === 'gemini' ? 'gemini' : 'default') as ProviderMode,
    hasKey: Boolean(row.key_hash),
    keyPreview: row.key_preview || null,
    keyHash: row.key_hash ? `${row.key_hash.slice(0, 8)}...${row.key_hash.slice(-8)}` : null,
    modelName: row.model_name || DEFAULT_MODEL,
  };
}

/**
 * Internal helper for chat execution only: decrypts the stored key in-memory.
 * Returns null apiKey if not configured or if provider_mode is 'default'.
 */
export async function getDecryptedUserApiKey(userId: number): Promise<{
  mode: ProviderMode;
  apiKey: string | null;
  modelName: string;
}> {
  const row = await dbQueryOne<UserProviderRow>(
    `SELECT user_id, provider_mode, encrypted_key, model_name
       FROM user_providers
      WHERE user_id = $1`,
    [userId],
    `PROVIDER: load encrypted key for chat execution for user #${userId}`
  );

  if (!row) {
    return {
      mode: 'default',
      apiKey: null,
      modelName: DEFAULT_MODEL,
    };
  }

  const mode = (row.provider_mode === 'gemini' ? 'gemini' : 'default') as ProviderMode;
  let decryptedApiKey: string | null = null;

  if (row.encrypted_key) {
    try {
      decryptedApiKey = decryptKey(row.encrypted_key);
    } catch (err) {
      console.error(`Failed to decrypt API key for user #${userId}:`, err);
      decryptedApiKey = null;
    }
  }

  return {
    mode,
    apiKey: decryptedApiKey,
    modelName: row.model_name || DEFAULT_MODEL,
  };
}

/**
 * Updates or sets the provider configuration for a user.
 * Encrypts and hashes any incoming API key immediately.
 */
export async function setUserProvider(
  userId: number,
  options: {
    mode?: ProviderMode;
    apiKey?: string;
    modelName?: string;
  }
): Promise<SafeUserProvider> {
  const current = await dbQueryOne<UserProviderRow>(
    `SELECT user_id, provider_mode, encrypted_key, key_hash, key_preview, model_name
       FROM user_providers
      WHERE user_id = $1`,
    [userId]
  );

  const targetMode = options.mode || (current?.provider_mode as ProviderMode) || 'default';
  const targetModel = options.modelName?.trim() || current?.model_name || DEFAULT_MODEL;

  let encryptedKey = current?.encrypted_key || null;
  let keyHash = current?.key_hash || null;
  let keyPreview = current?.key_preview || null;

  if (typeof options.apiKey === 'string') {
    const raw = options.apiKey.trim();
    if (raw.length > 0) {
      encryptedKey = encryptKey(raw);
      keyHash = hashKey(raw);
      keyPreview = maskKey(raw);
    }
  }

  await dbQuery(
    `INSERT INTO user_providers (user_id, provider_mode, encrypted_key, key_hash, key_preview, model_name, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET provider_mode = EXCLUDED.provider_mode,
         encrypted_key = COALESCE(EXCLUDED.encrypted_key, user_providers.encrypted_key),
         key_hash = COALESCE(EXCLUDED.key_hash, user_providers.key_hash),
         key_preview = COALESCE(EXCLUDED.key_preview, user_providers.key_preview),
         model_name = EXCLUDED.model_name,
         updated_at = NOW()`,
    [userId, targetMode, encryptedKey, keyHash, keyPreview, targetModel],
    `PROVIDER: upsert provider mode=${targetMode} for user #${userId}`
  );

  return {
    mode: targetMode,
    hasKey: Boolean(keyHash),
    keyPreview,
    keyHash: keyHash ? `${keyHash.slice(0, 8)}...${keyHash.slice(-8)}` : null,
    modelName: targetModel,
  };
}

/**
 * Clears the user's stored custom key and resets mode to default chunking.
 */
export async function clearUserApiKey(userId: number): Promise<SafeUserProvider> {
  await dbQuery(
    `UPDATE user_providers
        SET encrypted_key = NULL,
            key_hash = NULL,
            key_preview = NULL,
            provider_mode = 'default',
            updated_at = NOW()
      WHERE user_id = $1`,
    [userId],
    `PROVIDER: clear API key and revert to default chunking for user #${userId}`
  );

  return {
    mode: 'default',
    hasKey: false,
    keyPreview: null,
    keyHash: null,
    modelName: DEFAULT_MODEL,
  };
}

export interface GeminiModelInfo {
  id: string;
  displayName: string;
  description?: string;
}

export const FALLBACK_GEMINI_MODELS: GeminiModelInfo[] = [
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
];

/**
 * Fetches available Gemini models directly from Google's Gemini API for a given API key.
 * Only returns models that support generateContent.
 */
export async function fetchGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('API key is empty.');
  }

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    method: 'GET',
    headers: {
      'x-goog-api-key': cleanKey,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    let msg = `Google API returned status ${res.status}`;
    try {
      const err = await res.json();
      if (err.error?.message) {
        msg = err.error.message;
      }
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  const rawList: any[] = Array.isArray(data.models) ? data.models : [];

  // Filter for models supporting generateContent (exclude embeddings, etc.)
  const supported = rawList.filter((m) => {
    const methods = m.supportedGenerationMethods;
    return Array.isArray(methods) && methods.includes('generateContent');
  });

  const models: GeminiModelInfo[] = supported.map((m) => {
    const id = m.name?.replace(/^models\//, '') || m.name;
    return {
      id,
      displayName: m.displayName || id,
      description: m.description || '',
    };
  });

  // Sort with modern Flash and Pro models near the top
  models.sort((a, b) => {
    const score = (id: string) => {
      const lower = id.toLowerCase();
      if (lower.includes('2.5-flash')) return 100;
      if (lower.includes('2.0-flash')) return 90;
      if (lower.includes('1.5-flash')) return 80;
      if (lower.includes('1.5-pro')) return 70;
      if (lower.includes('flash')) return 60;
      if (lower.includes('pro')) return 50;
      return 10;
    };
    return score(b.id) - score(a.id);
  });

  return models.length > 0 ? models : FALLBACK_GEMINI_MODELS;
}

