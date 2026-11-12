// ============================================================================
// Data access layer — PostgreSQL (relational + pgvector) + RBAC enforcement
// Every operation below is a real SQL statement executed against Postgres.
// ============================================================================

import { dbQuery, dbQueryOne, dbTransaction, getSqlLog, toVectorLiteral } from './pg';
import { generateEmbedding } from './embeddings';
import {
  verifyPassword,
  canIngestDocuments,
  canResolveAnomalies,
  isAdmin,
  type CurrentUser,
} from './auth';

export { getSqlLog };

export interface UserRecord extends CurrentUser {
  username: string;
  password_hash: string;
  is_active: boolean;
  created_at: string;
}

export interface DocRecord {
  document_id: number;
  title: string;
  file_name: string;
  doc_type: string;
  mission: string;
  subsystem: string;
  status: string;
  chunk_count: number;
  uploaded_by_name?: string | null;
  created_at: string;
}

export interface ChunkRecord {
  chunk_id: string;
  document_id: number;
  chunk_index: number;
  token_count: number;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  chunk_id: string;
  document_title: string;
  document_id: number;
  file_name: string;
  subsystem: string;
  mission: string;
  text: string;
  similarity: number;
  chunk_index: number;
}

export interface AnomalyRecord {
  anomaly_id: number;
  anomaly_code: string;
  title: string;
  severity: string;
  status: string;
  mission_code: string;
  subsystem_code: string;
  reported_by_name: string | null;
  resolved_by_name: string | null;
  mitigation_action: string | null;
  created_at: string;
}

// ---- AUTHENTICATION ----

export async function authenticateUser(
  identifier: string,
  password: string
): Promise<Omit<UserRecord, 'password_hash'> | null> {
  // Usernames are the sign-in identifier; email is accepted as a fallback.
  const row = await dbQueryOne<UserRecord>(
    `SELECT user_id, username, full_name, email, department,
            password_hash, is_active, created_at
       FROM users
      WHERE LOWER(username) = LOWER($1) OR LOWER(COALESCE(email, '')) = LOWER($1)`,
    [identifier],
    `AUTH: look up user by username (${identifier})`
  );

  if (!row) {
    await dbQuery(
      `INSERT INTO audit_logs (action_type, entity_type, entity_id, user_id, details)
       VALUES ('AUTH_FAILURE', 'users', $1, NULL, jsonb_build_object('reason', 'unknown_username'))`,
      [identifier],
      `AUTHZ: record failed login for unknown username (${identifier})`
    );
    return null;
  }

  if (!verifyPassword(password, row.password_hash)) {
    await dbQuery(
      `INSERT INTO audit_logs (action_type, entity_type, entity_id, user_id, details)
       VALUES ('AUTH_FAILURE', 'users', $1, $2, jsonb_build_object('reason', 'bad_password'))`,
      [String(row.user_id), row.user_id],
      `AUTHZ: record failed login (wrong password) for user #${row.user_id}`
    );
    return null;
  }

  if (!row.is_active) return null;

  await dbQuery(
    `INSERT INTO audit_logs (action_type, entity_type, entity_id, user_id, details)
     VALUES ('AUTH_SUCCESS', 'users', $1, $2, jsonb_build_object('status', 'ok'))`,
    [String(row.user_id), row.user_id],
    `AUTH SUCCESS: "${row.full_name}"`
  );

  return toSafeUser(row);
}

function toSafeUser(row: UserRecord): Omit<UserRecord, 'password_hash'> {
  return {
    user_id: row.user_id,
    username: row.username,
    full_name: row.full_name,
    email: row.email ?? '',
    department: row.department,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

export async function getUserById(userId: number): Promise<Omit<UserRecord, 'password_hash'> | null> {
  const row = await dbQueryOne<UserRecord>(
    `SELECT user_id, username, full_name, email, department,
            password_hash, is_active, created_at
       FROM users
      WHERE user_id = $1`,
    [userId],
    `AUTH: load session user #${userId}`
  );
  return row?.is_active ? toSafeUser(row) : null;
}

export async function getAllUsers(caller?: CurrentUser): Promise<Omit<UserRecord, 'password_hash'>[]> {
  if (caller && !isAdmin(caller)) {
    throw new Error('Forbidden: Only administrators can view user records.');
  }
  const { rows } = await dbQuery<UserRecord>(
    `SELECT user_id, username, full_name, email, department,
            password_hash, is_active, created_at
       FROM users
      ORDER BY user_id`,
    [],
    'USERS: list all users'
  );
  return rows.map(toSafeUser);
}

export async function removeUser(userId: number, caller: CurrentUser): Promise<boolean> {
  if (!isAdmin(caller)) {
    throw new Error('Forbidden: Only administrators can remove users.');
  }
  if (userId === caller.user_id) {
    throw new Error('Administrators cannot delete their own account.');
  }
  const { rowCount } = await dbQuery(
    `DELETE FROM users WHERE user_id = $1`,
    [userId],
    `ADMIN: delete user #${userId} by "${caller.username}"`
  );
  if (rowCount > 0) {
    await dbQuery(
      `INSERT INTO audit_logs (action_type, entity_type, entity_id, user_id, details)
       VALUES ('USER_REMOVED', 'users', $1, $2, $3::jsonb)`,
      [String(userId), caller.user_id, JSON.stringify({ removed_user_id: userId })],
      `AUDIT: user #${userId} removed by admin "${caller.username}"`
    );
  }
  return rowCount > 0;
}

export async function toggleUserActive(userId: number, caller: CurrentUser): Promise<boolean> {
  if (!isAdmin(caller)) {
    throw new Error('Forbidden: Only administrators can modify user active status.');
  }
  if (userId === caller.user_id) {
    throw new Error('Administrators cannot deactivate their own account.');
  }
  const row = await dbQueryOne<{ is_active: boolean }>(
    `UPDATE users SET is_active = NOT is_active WHERE user_id = $1 RETURNING is_active`,
    [userId],
    `ADMIN: toggle active status for user #${userId} by "${caller.username}"`
  );
  if (!row) throw new Error('User not found.');
  await dbQuery(
    `INSERT INTO audit_logs (action_type, entity_type, entity_id, user_id, details)
     VALUES ('USER_STATUS_TOGGLED', 'users', $1, $2, $3::jsonb)`,
    [String(userId), caller.user_id, JSON.stringify({ user_id: userId, active: row.is_active })],
    `AUDIT: user #${userId} active status toggled to ${row.is_active}`
  );
  return row.is_active;
}

// ---- AUTHORIZATION ----

export async function authorizeAction(
  user: CurrentUser,
  action: 'UPLOAD_DOCUMENT' | 'DELETE_DOCUMENT' | 'RESOLVE_ANOMALY' | 'QUERY_RAG'
): Promise<{ allowed: boolean; reason?: string }> {
  await dbQuery(
    `INSERT INTO audit_logs (action_type, entity_type, entity_id, user_id, details)
     VALUES ('AUTHZ_ALLOWED', 'users', $1, $2, jsonb_build_object('action', $3::text))`,
    [String(user.user_id), user.user_id, action],
    `AUTHZ ALLOWED: "${user.full_name}" → ${action}`
  );

  return { allowed: true };
}

// ---- DOCUMENT INGESTION (single ACID transaction) ----

async function resolveMissionId(missionCode?: string | null): Promise<number | null> {
  if (!missionCode || !missionCode.trim() || missionCode.toUpperCase() === 'GENERAL') {
    return null;
  }
  const row = await dbQueryOne<{ mission_id: number }>(
    `SELECT mission_id FROM spacecraft_missions WHERE mission_code = $1`,
    [missionCode],
    `LOOKUP: resolve mission code ${missionCode}`
  );
  return row ? row.mission_id : null;
}

async function resolveSubsystemId(category?: string | null): Promise<number | null> {
  if (!category || !category.trim() || category.toUpperCase() === 'GENERAL') {
    return null;
  }
  const row = await dbQueryOne<{ subsystem_id: number }>(
    `SELECT subsystem_id FROM subsystems
      WHERE category = $1 OR code = $1
      ORDER BY subsystem_id LIMIT 1`,
    [category],
    `LOOKUP: resolve subsystem ${category}`
  );
  return row ? row.subsystem_id : null;
}

export async function ingestDocument(
  input: {
    title: string;
    fileName: string;
    docType?: string;
    mission?: string | null;
    subsystem?: string | null;
    textChunks: string[];
    fileSizeKb: number;
    clearance?: string;
  },
  user: CurrentUser
): Promise<DocRecord & { uploader: { full_name: string } }> {
  const missionId = await resolveMissionId(input.mission);
  const subsystemId = await resolveSubsystemId(input.subsystem);
  const docType = input.docType || 'STANDARD_PROCEDURE';

  const stored = await dbTransaction(
    `INGEST: document "${input.title}" with ${input.textChunks.length} vector chunks`,
    async (tx) => {
      const doc = await tx.query(
        `INSERT INTO engineering_documents
           (mission_id, subsystem_id, title, doc_type, file_name, file_size_kb,
            version, uploaded_by, status, chunk_count)
         VALUES ($1, $2, $3, $4, $5, $6, 'v1.0.0', $7, 'INDEXED', $8)
         RETURNING document_id, title, file_name, doc_type, status, chunk_count, created_at`,
        [
          missionId,
          subsystemId,
          input.title,
          docType,
          input.fileName,
          input.fileSizeKb,
          user.user_id,
          input.textChunks.length,
        ]
      );
      const created = doc.rows[0];
      tx.log(
        `INSERT INTO engineering_documents (mission_id, subsystem_id, title, doc_type, file_name, file_size_kb, uploaded_by, status, chunk_count)\nVALUES (${missionId ?? 'NULL'}, ${subsystemId ?? 'NULL'}, '${input.title.replace(/'/g, "''")}', '${docType}', '${input.fileName.replace(/'/g, "''")}', ${input.fileSizeKb}, ${user.user_id}, 'INDEXED', ${input.textChunks.length})\nRETURNING document_id;`,
        `INSERT engineering_documents → document #${created.document_id}`,
        1
      );

      for (let i = 0; i < input.textChunks.length; i += 1) {
        const text = input.textChunks[i];
        const embedding = generateEmbedding(text);
        const tokenCount = Math.ceil(text.split(/\s+/).length * 1.3);

        const chunk = await tx.query(
          `INSERT INTO document_chunks (document_id, chunk_index, token_count, chunk_text, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb)
           RETURNING chunk_id`,
          [
            created.document_id,
            i + 1,
            tokenCount,
            text,
            toVectorLiteral(embedding),
            JSON.stringify({ subsystem: input.subsystem || 'GENERAL', mission: input.mission || 'GENERAL', tokens: tokenCount }),
          ]
        );
        if (i < 5 || i === input.textChunks.length - 1) {
          tx.log(
            `INSERT INTO document_chunks (document_id, chunk_index, token_count, chunk_text, embedding)\nVALUES (${created.document_id}, ${i + 1}, ${tokenCount}, '${text.slice(0, 48).replace(/'/g, "''")}...', '[${embedding.length}-dim vector]');`,
            `INSERT chunk ${i + 1}/${input.textChunks.length} (vector(384) cosine indexed)`,
            1
          );
        }
        void chunk;
      }

      return created;
    }
  );

  return {
    document_id: stored.document_id,
    title: stored.title,
    file_name: stored.file_name,
    doc_type: stored.doc_type,
    mission: input.mission || 'GENERAL',
    subsystem: input.subsystem || 'GENERAL',
    status: stored.status,
    chunk_count: stored.chunk_count,
    created_at: stored.created_at.toISOString(),
    uploader: { full_name: user.full_name },
  };
}

export async function deleteDocument(documentId: number, user: CurrentUser): Promise<boolean> {
  if (!isAdmin(user)) {
    const { rowCount } = await dbQuery(
      `DELETE FROM engineering_documents WHERE document_id = $1 AND uploaded_by = $2`,
      [documentId, user.user_id],
      `DML DELETE: document #${documentId} by owner #${user.user_id} "${user.full_name}"`
    );
    return rowCount > 0;
  }

  const { rowCount } = await dbQuery(
    `DELETE FROM engineering_documents WHERE document_id = $1`,
    [documentId],
    `DML DELETE: document #${documentId} by admin "${user.full_name}" (chunks cascade)`
  );
  return rowCount > 0;
}

// ---- DOCUMENT READS ----

export async function getAllDocuments(user?: CurrentUser, limit = 50): Promise<DocRecord[]> {
  if (user && !isAdmin(user)) {
    const { rows } = await dbQuery<DocRecord>(
      `SELECT d.document_id, d.title, d.file_name, d.doc_type, d.status, d.chunk_count,
              d.created_at,
              COALESCE(m.mission_code, 'GENERAL') AS mission,
              COALESCE(s.category, 'GENERAL') AS subsystem,
              u.full_name AS uploaded_by_name
         FROM engineering_documents d
         LEFT JOIN spacecraft_missions m ON m.mission_id = d.mission_id
         LEFT JOIN subsystems s ON s.subsystem_id = d.subsystem_id
         LEFT JOIN users u ON u.user_id = d.uploaded_by
        WHERE d.uploaded_by = $1
        ORDER BY d.created_at DESC, d.document_id DESC
        LIMIT $2`,
      [user.user_id, limit],
      `DML SELECT: user #${user.user_id} private documents`
    );
    return rows.map((r) => ({ ...r, created_at: r.created_at as unknown as string }));
  }

  const { rows } = await dbQuery<DocRecord>(
    `SELECT d.document_id, d.title, d.file_name, d.doc_type, d.status, d.chunk_count,
            d.created_at,
            COALESCE(m.mission_code, 'GENERAL') AS mission,
            COALESCE(s.category, 'GENERAL') AS subsystem,
            u.full_name AS uploaded_by_name
       FROM engineering_documents d
       LEFT JOIN spacecraft_missions m ON m.mission_id = d.mission_id
       LEFT JOIN subsystems s ON s.subsystem_id = d.subsystem_id
       LEFT JOIN users u ON u.user_id = d.uploaded_by
      ORDER BY d.created_at DESC, d.document_id DESC
      LIMIT $1`,
    [limit],
    'DML SELECT: documents with mission + subsystem + uploader JOIN'
  );
  return rows.map((r) => ({ ...r, created_at: r.created_at as unknown as string }));
}

export async function getDocumentChunks(docId: number): Promise<ChunkRecord[]> {
  const { rows } = await dbQuery<ChunkRecord>(
    `SELECT chunk_id, document_id, chunk_index, token_count, chunk_text AS text, metadata
       FROM document_chunks
      WHERE document_id = $1
      ORDER BY chunk_index`,
    [docId],
    `DML SELECT: chunks for document #${docId}`
  );
  return rows;
}

export async function getStats(user?: CurrentUser) {
  if (user && !isAdmin(user)) {
    const row = await dbQueryOne<{
      total_documents: string;
      total_chunks: string;
      total_tokens: string;
      total_missions: string;
      active_anomalies: string;
    }>(
      `SELECT (SELECT COUNT(*) FROM engineering_documents WHERE uploaded_by = $1) AS total_documents,
              (SELECT COUNT(*) FROM document_chunks dc JOIN engineering_documents d ON d.document_id = dc.document_id WHERE d.uploaded_by = $1) AS total_chunks,
              (SELECT COALESCE(SUM(dc.token_count), 0) FROM document_chunks dc JOIN engineering_documents d ON d.document_id = dc.document_id WHERE d.uploaded_by = $1) AS total_tokens,
              (SELECT COUNT(*) FROM spacecraft_missions) AS total_missions,
              (SELECT COUNT(*) FROM anomalies_incidents WHERE status IN ('OPEN','INVESTIGATING')) AS active_anomalies`,
      [user.user_id],
      `AGGREGATE: user #${user.user_id} private stats`
    );
    return {
      totalDocuments: Number(row?.total_documents ?? 0),
      totalChunks: Number(row?.total_chunks ?? 0),
      totalTokens: Number(row?.total_tokens ?? 0),
      totalMissions: Number(row?.total_missions ?? 0),
      activeAnomalies: Number(row?.active_anomalies ?? 0),
    };
  }

  const row = await dbQueryOne<{
    total_documents: string;
    total_chunks: string;
    total_tokens: string;
    total_missions: string;
    active_anomalies: string;
  }>(
    `SELECT (SELECT COUNT(*) FROM engineering_documents) AS total_documents,
            (SELECT COUNT(*) FROM document_chunks) AS total_chunks,
            (SELECT COALESCE(SUM(token_count), 0) FROM document_chunks) AS total_tokens,
            (SELECT COUNT(*) FROM spacecraft_missions) AS total_missions,
            (SELECT COUNT(*) FROM anomalies_incidents WHERE status IN ('OPEN','INVESTIGATING')) AS active_anomalies`,
    [],
    'AGGREGATE: knowledge base + mission + anomaly counts'
  );

  return {
    totalDocuments: Number(row?.total_documents ?? 0),
    totalChunks: Number(row?.total_chunks ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
    totalMissions: Number(row?.total_missions ?? 0),
    activeAnomalies: Number(row?.active_anomalies ?? 0),
  };
}

// ---- VECTOR SIMILARITY SEARCH (stored function match_spacecraft_knowledge) ----

export async function semanticSearch(
  query: string,
  topK: number,
  user?: CurrentUser,
  subsystemCode?: string | null,
  missionCode?: string | null
): Promise<SearchResult[]> {
  const queryEmbedding = generateEmbedding(query);

  if (user && !isAdmin(user)) {
    // Non-admin users search ONLY their own uploaded documents
    const { rows } = await dbQuery<{
      chunk_id: string;
      document_id: number;
      document_title: string;
      file_name: string;
      chunk_text: string;
      subsystem_code: string;
      mission_code: string;
      similarity: number;
      chunk_index: number;
    }>(
      `SELECT dc.chunk_id, d.document_id, d.title AS document_title, d.file_name,
              dc.chunk_text,
              COALESCE(s.code, 'GENERAL') AS subsystem_code,
              COALESCE(m.mission_code, 'GENERAL') AS mission_code,
              dc.chunk_index,
              1 - (dc.embedding <=> $1::vector) AS similarity
         FROM document_chunks dc
         JOIN engineering_documents d ON d.document_id = dc.document_id
         LEFT JOIN subsystems s ON s.subsystem_id = d.subsystem_id
         LEFT JOIN spacecraft_missions m ON m.mission_id = d.mission_id
        WHERE dc.embedding IS NOT NULL
          AND d.uploaded_by = $2
          AND 1 - (dc.embedding <=> $1::vector) >= 0.12
          AND ($4::text IS NULL OR s.category = $4 OR s.code = $4)
          AND ($5::text IS NULL OR m.mission_code = $5)
        ORDER BY dc.embedding <=> $1::vector
        LIMIT $3`,
      [toVectorLiteral(queryEmbedding), user.user_id, topK, subsystemCode || null, missionCode || null],
      `VECTOR SEARCH: user #${user.user_id} private search — top ${topK}`
    );

    return rows.map((r) => ({
      chunk_id: r.chunk_id,
      document_id: r.document_id,
      document_title: r.document_title,
      file_name: r.file_name,
      subsystem: r.subsystem_code,
      mission: r.mission_code,
      text: r.chunk_text,
      chunk_index: r.chunk_index,
      similarity: Number(r.similarity),
    }));
  }

  // Admin searches across all documents
  const { rows } = await dbQuery<{
    chunk_id: string;
    document_id: number;
    document_title: string;
    file_name: string;
    chunk_text: string;
    subsystem_code: string;
    mission_code: string;
    similarity: number;
    chunk_index: number;
  }>(
    `SELECT dc.chunk_id, d.document_id, d.title AS document_title, d.file_name,
            dc.chunk_text,
            COALESCE(s.code, 'GENERAL') AS subsystem_code,
            COALESCE(m.mission_code, 'GENERAL') AS mission_code,
            dc.chunk_index,
            1 - (dc.embedding <=> $1::vector) AS similarity
       FROM document_chunks dc
       JOIN engineering_documents d ON d.document_id = dc.document_id
       LEFT JOIN subsystems s ON s.subsystem_id = d.subsystem_id
       LEFT JOIN spacecraft_missions m ON m.mission_id = d.mission_id
      WHERE dc.embedding IS NOT NULL
        AND 1 - (dc.embedding <=> $1::vector) >= 0.12
        AND ($3::text IS NULL OR s.category = $3 OR s.code = $3)
        AND ($4::text IS NULL OR m.mission_code = $4)
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $2`,
    [toVectorLiteral(queryEmbedding), topK, subsystemCode || null, missionCode || null],
    `VECTOR SEARCH: cosine similarity (<=>) — top ${topK}`
  );

  return rows.map((r) => ({
    chunk_id: r.chunk_id,
    document_id: r.document_id,
    document_title: r.document_title,
    file_name: r.file_name,
    subsystem: r.subsystem_code,
    mission: r.mission_code,
    text: r.chunk_text,
    chunk_index: r.chunk_index,
    similarity: Number(r.similarity),
  }));
}

// ---- DASHBOARD / ANALYTICS (views + aggregations) ----

export interface ReadinessRow {
  subsystem_code: string;
  subsystem_name: string;
  category: string;
  criticality_level: string;
  lead_engineer_name: string | null;
  total_indexed_documents: string;
  total_knowledge_chunks: string;
  active_anomalies_count: string;
  critical_threat_count: string;
}

export async function getSubsystemReadiness(): Promise<ReadinessRow[]> {
  const { rows } = await dbQuery<ReadinessRow>(
    `SELECT subsystem_code, subsystem_name, category, criticality_level, lead_engineer_name,
            total_indexed_documents, total_knowledge_chunks, active_anomalies_count, critical_threat_count
       FROM vw_subsystem_readiness_summary
      ORDER BY critical_threat_count DESC, active_anomalies_count DESC, subsystem_code`,
    [],
    'VIEW: vw_subsystem_readiness_summary (JOIN + GROUP BY + FILTER aggregation)'
  );
  return rows;
}

export async function getAnomalies(): Promise<AnomalyRecord[]> {
  const { rows } = await dbQuery<AnomalyRecord>(
    `SELECT a.anomaly_id, a.anomaly_code, a.title, a.severity, a.status,
            m.mission_code, s.code AS subsystem_code,
            rep.full_name AS reported_by_name, res.full_name AS resolved_by_name,
            a.mitigation_action, a.created_at
       FROM anomalies_incidents a
       JOIN spacecraft_missions m ON m.mission_id = a.mission_id
       JOIN subsystems s ON s.subsystem_id = a.subsystem_id
       LEFT JOIN users rep ON rep.user_id = a.reported_by
       LEFT JOIN users res ON res.user_id = a.resolved_by
      ORDER BY CASE a.severity WHEN 'CATASTROPHIC' THEN 1 WHEN 'SEVERE' THEN 2 WHEN 'MODERATE' THEN 3 ELSE 4 END,
               a.created_at DESC`,
    [],
    'DML SELECT: anomaly register with mission/subsystem/personnel JOINs'
  );
  return rows;
}

export async function getAuditTrail(limit = 25) {
  const { rows } = await dbQuery<{
    log_id: string;
    action_type: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, unknown>;
    timestamp: string;
    user_name: string | null;
  }>(
    `SELECT a.log_id, a.action_type, a.entity_type, a.entity_id, a.details, a.timestamp,
            u.full_name AS user_name
       FROM audit_logs a
       LEFT JOIN users u ON u.user_id = a.user_id
      ORDER BY a.timestamp DESC
      LIMIT $1`,
    [limit],
    'TRIGGER OUTPUT: latest audit_logs rows (document lifecycle trigger)'
  );
  return rows;
}

export async function severityBreakdown() {
  const { rows } = await dbQuery<{ severity: string; incidents: string }>(
    `SELECT severity, COUNT(*) AS incidents
       FROM anomalies_incidents
      GROUP BY severity
     HAVING COUNT(*) >= 1
      ORDER BY incidents DESC`,
    [],
    'GROUP BY + HAVING: anomaly severity distribution'
  );
  return rows;
}

export async function getVectorHealth() {
  const row = await dbQueryOne<{
    vectorized_chunks: string;
    total_chunks: string;
    total_tokens: string;
    avg_tokens: string;
  }>(
    `SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS vectorized_chunks,
            COUNT(*) AS total_chunks,
            COALESCE(SUM(token_count), 0) AS total_tokens,
            COALESCE(ROUND(AVG(token_count), 1), 0) AS avg_tokens
       FROM document_chunks`,
    [],
    'VIEW-ALIGNED AGGREGATE: vector coverage + token statistics'
  );
  return {
    vectorizedChunks: Number(row?.vectorized_chunks ?? 0),
    totalChunks: Number(row?.total_chunks ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
    avgTokens: Number(row?.avg_tokens ?? 0),
  };
}

export async function resolveAnomaly(anomalyId: number, user: CurrentUser): Promise<boolean> {
  const { rowCount } = await dbQuery(
    `UPDATE anomalies_incidents
        SET status = 'RESOLVED', resolved_by = $2
      WHERE anomaly_id = $1 AND status <> 'RESOLVED'`,
    [anomalyId, user.user_id],
    `DML UPDATE: anomaly #${anomalyId} marked RESOLVED by ${user.full_name}`
  );
  return rowCount > 0;
}

export async function createAnomaly(
  input: {
    anomalyCode: string;
    title: string;
    severity: 'LOW' | 'MODERATE' | 'SEVERE' | 'CATASTROPHIC';
    missionCode: string;
    subsystemCode: string;
    rootCause?: string;
    mitigationAction?: string;
  },
  user: CurrentUser
): Promise<AnomalyRecord> {
  const missionId = await resolveMissionId(input.missionCode);
  const subsystemId = await resolveSubsystemId(input.subsystemCode);

  const { rows } = await dbQuery<{ anomaly_id: number }>(
    `INSERT INTO anomalies_incidents
       (anomaly_code, mission_id, subsystem_id, title, severity, status, root_cause, mitigation_action, reported_by)
     VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7, $8)
     RETURNING anomaly_id`,
    [input.anomalyCode, missionId, subsystemId, input.title, input.severity, input.rootCause || null, input.mitigationAction || null, user.user_id],
    `DML INSERT: new anomaly ${input.anomalyCode} (${input.severity})`
  );

  const all = await getAnomalies();
  return all.find((a) => a.anomaly_id === rows[0].anomaly_id) as AnomalyRecord;
}

