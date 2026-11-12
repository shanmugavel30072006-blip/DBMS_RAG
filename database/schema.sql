-- ============================================================================
-- Spacecraft Engineering Knowledge Management & Intelligent Retrieval System
-- Database Schema (PostgreSQL + pgvector)
-- Option 2: SQL Relational + Vector Database Paradigm
-- ============================================================================

-- 1. Enable Vector & UUID extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cleanup existing objects if needed
DROP VIEW IF EXISTS vw_subsystem_readiness_summary CASCADE;
DROP VIEW IF EXISTS vw_document_vector_stats CASCADE;
DROP VIEW IF EXISTS vw_anomaly_impact_matrix CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS document_chunks CASCADE;
DROP TABLE IF EXISTS anomalies_incidents CASCADE;
DROP TABLE IF EXISTS engineering_documents CASCADE;
DROP TABLE IF EXISTS subsystems CASCADE;
DROP TABLE IF EXISTS spacecraft_missions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- RELATIONAL TABLES (DDL: CREATE, KEYS, CONSTRAINTS)
-- ============================================================================

-- Table 1: Users
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    username VARCHAR(60) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE,
    department VARCHAR(80) NOT NULL DEFAULT 'Engineering',
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Case-insensitive identifiers match login behavior and prevent ambiguous accounts.
CREATE UNIQUE INDEX users_username_lower_unique ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email)) WHERE email IS NOT NULL;

-- Table 2: Spacecraft Missions
CREATE TABLE spacecraft_missions (
    mission_id SERIAL PRIMARY KEY,
    mission_code VARCHAR(20) UNIQUE NOT NULL,
    mission_name VARCHAR(150) NOT NULL,
    target_body VARCHAR(80) NOT NULL, -- e.g. Lunar Orbit, Mars Surface, L2 Lagrange Point, Low Earth Orbit
    launch_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'EXTENDED', 'CRITICAL_ALERT')),
    agency VARCHAR(80) NOT NULL DEFAULT 'NASA / International Space Consortium',
    budget_millions NUMERIC(10,2) CHECK (budget_millions >= 0),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 3: Spacecraft Engineering Subsystems
CREATE TABLE subsystems (
    subsystem_id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('PROPULSION', 'AVIONICS', 'THERMAL', 'GNC', 'POWER_EPS', 'COMMUNICATIONS', 'STRUCTURES', 'ECLSS')),
    lead_engineer_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    criticality_level VARCHAR(20) NOT NULL DEFAULT 'HIGH' CHECK (criticality_level IN ('LOW', 'MEDIUM', 'HIGH', 'MISSION_CRITICAL')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 4: Engineering Documents (Technical Manuals, Specs, Telemetry Handbooks)
CREATE TABLE engineering_documents (
    document_id SERIAL PRIMARY KEY,
    mission_id INT REFERENCES spacecraft_missions(mission_id) ON DELETE SET NULL,
    subsystem_id INT REFERENCES subsystems(subsystem_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('FLIGHT_MANUAL', 'ANOMALY_REPORT', 'TELEMETRY_SPEC', 'DESIGN_REQUIREMENT', 'FAILURE_ANALYSIS', 'STANDARD_PROCEDURE')),
    file_name VARCHAR(255) NOT NULL,
    file_size_kb INT CHECK (file_size_kb >= 0),
    version VARCHAR(20) NOT NULL DEFAULT 'v1.0.0',
    uploaded_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'INDEXED' CHECK (status IN ('UPLOADED', 'CHUNKING', 'EMBEDDING', 'INDEXED', 'ARCHIVED', 'FAILED')),
    chunk_count INT NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 5: Document Chunks & Vector Storage (Vector DB component with pgvector)
CREATE TABLE document_chunks (
    chunk_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id INT NOT NULL REFERENCES engineering_documents(document_id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    token_count INT NOT NULL DEFAULT 0,
    chunk_text TEXT NOT NULL,
    -- Embedding vector dimension: 384 dimensions (supports standard lightweight models like all-MiniLM-L6-v2)
    embedding vector(384),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_doc_chunk UNIQUE (document_id, chunk_index)
);

-- Table 6: Anomalies & Incident Reports (Historical telemetry & in-flight failures)
CREATE TABLE anomalies_incidents (
    anomaly_id SERIAL PRIMARY KEY,
    anomaly_code VARCHAR(30) UNIQUE NOT NULL,
    mission_id INT NOT NULL REFERENCES spacecraft_missions(mission_id) ON DELETE CASCADE,
    subsystem_id INT NOT NULL REFERENCES subsystems(subsystem_id) ON DELETE RESTRICT,
    document_id INT REFERENCES engineering_documents(document_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MODERATE', 'SEVERE', 'CATASTROPHIC')),
    status VARCHAR(30) NOT NULL DEFAULT 'INVESTIGATING' CHECK (status IN ('OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'CLOSED')),
    telemetry_timestamp TIMESTAMP WITH TIME ZONE,
    root_cause TEXT,
    mitigation_action TEXT,
    reported_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    resolved_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 7: Audit Logs (System actions, access tracking, DDL/DML events)
CREATE TABLE audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    details JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES (B-Tree + HNSW Vector Index)
-- ============================================================================

-- B-Tree Indexes on Foreign Keys and High-Frequency Filter Columns
CREATE INDEX idx_docs_mission_subsystem ON engineering_documents(mission_id, subsystem_id);
CREATE INDEX idx_docs_status ON engineering_documents(status);
CREATE INDEX idx_anomalies_severity ON anomalies_incidents(severity, status);
CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);

-- HNSW Vector Index for High-Performance Semantic Retrieval (Cosine Distance)
CREATE INDEX idx_document_chunks_embedding_hnsw 
ON document_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- ADVANCED DATABASE FEATURE 1: VIEWS
-- ============================================================================

-- View 1: Subsystem Readiness & Risk Summary (Cross-table JOIN + Aggregations)
CREATE OR REPLACE VIEW vw_subsystem_readiness_summary AS
SELECT 
    s.subsystem_id,
    s.code AS subsystem_code,
    s.name AS subsystem_name,
    s.category,
    s.criticality_level,
    u.full_name AS lead_engineer_name,
    COALESCE(d.total_indexed_documents, 0) AS total_indexed_documents,
    COALESCE(d.total_knowledge_chunks, 0) AS total_knowledge_chunks,
    COALESCE(a.active_anomalies_count, 0) AS active_anomalies_count,
    COALESCE(a.critical_threat_count, 0) AS critical_threat_count,
    d.avg_doc_size_kb
FROM subsystems s
LEFT JOIN users u ON s.lead_engineer_id = u.user_id
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_indexed_documents, SUM(chunk_count) AS total_knowledge_chunks,
           ROUND(AVG(file_size_kb), 2) AS avg_doc_size_kb
    FROM engineering_documents WHERE subsystem_id = s.subsystem_id
) d ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE status IN ('OPEN', 'INVESTIGATING')) AS active_anomalies_count,
           COUNT(*) FILTER (WHERE severity IN ('SEVERE', 'CATASTROPHIC') AND status != 'CLOSED') AS critical_threat_count
    FROM anomalies_incidents WHERE subsystem_id = s.subsystem_id
) a ON TRUE;

-- View 2: Document Vector Metrics (Deep Vector Index Health)
CREATE OR REPLACE VIEW vw_document_vector_stats AS
SELECT 
    d.document_id,
    d.title,
    d.file_name,
    d.doc_type,
    COALESCE(m.mission_code, 'GENERAL') AS mission_code,
    COALESCE(s.code, 'GENERAL') AS subsystem_code,
    d.chunk_count,
    COUNT(dc.chunk_id) AS actual_chunks_stored,
    COUNT(dc.chunk_id) FILTER (WHERE dc.embedding IS NOT NULL) AS vectorized_chunks_count,
    COALESCE(SUM(dc.token_count), 0) AS total_tokens,
    d.status,
    d.created_at
FROM engineering_documents d
LEFT JOIN spacecraft_missions m ON d.mission_id = m.mission_id
LEFT JOIN subsystems s ON d.subsystem_id = s.subsystem_id
LEFT JOIN document_chunks dc ON d.document_id = dc.document_id
GROUP BY d.document_id, d.title, d.file_name, d.doc_type, m.mission_code, s.code, d.chunk_count, d.status, d.created_at;

-- View 3: Anomaly Impact Matrix
CREATE OR REPLACE VIEW vw_anomaly_impact_matrix AS
SELECT 
    m.mission_name,
    s.name AS subsystem_name,
    a.severity,
    a.status,
    COUNT(*) AS incident_count,
    MIN(a.created_at) AS earliest_incident,
    MAX(a.created_at) AS latest_incident
FROM anomalies_incidents a
JOIN spacecraft_missions m ON a.mission_id = m.mission_id
JOIN subsystems s ON a.subsystem_id = s.subsystem_id
GROUP BY m.mission_name, s.name, a.severity, a.status;

-- ============================================================================
-- ADVANCED DATABASE FEATURE 2 & 3: STORED FUNCTIONS / PROCEDURES & TRIGGERS
-- ============================================================================

-- Function 1: Intelligent Vector Semantic Search with Subsystem & Mission Filtering
CREATE OR REPLACE FUNCTION match_spacecraft_knowledge(
    query_embedding vector(384),
    match_threshold float DEFAULT 0.30,
    match_count int DEFAULT 5,
    filter_subsystem_id int DEFAULT NULL,
    filter_mission_id int DEFAULT NULL
)
RETURNS TABLE (
    chunk_id UUID,
    document_id INT,
    document_title VARCHAR,
    file_name VARCHAR,
    subsystem_code VARCHAR,
    mission_code VARCHAR,
    chunk_text TEXT,
    similarity float,
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.chunk_id,
        d.document_id,
        d.title AS document_title,
        d.file_name,
        COALESCE(s.code, 'GENERAL')::VARCHAR AS subsystem_code,
        COALESCE(m.mission_code, 'GENERAL')::VARCHAR AS mission_code,
        dc.chunk_text,
        1 - (dc.embedding <=> query_embedding) AS similarity,
        dc.metadata
    FROM document_chunks dc
    JOIN engineering_documents d ON dc.document_id = d.document_id
    LEFT JOIN subsystems s ON d.subsystem_id = s.subsystem_id
    LEFT JOIN spacecraft_missions m ON d.mission_id = m.mission_id
    WHERE 
        (1 - (dc.embedding <=> query_embedding)) >= match_threshold
        AND (filter_subsystem_id IS NULL OR d.subsystem_id = filter_subsystem_id)
        AND (filter_mission_id IS NULL OR d.mission_id = filter_mission_id)
    ORDER BY dc.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

-- Trigger Function: Auto Audit Log on Document Status or Revision Change
CREATE OR REPLACE FUNCTION fn_audit_document_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
        INSERT INTO audit_logs (action_type, entity_type, entity_id, user_id, details)
        VALUES (
            'DOCUMENT_UPDATE',
            'engineering_documents',
            NEW.document_id::TEXT,
            NEW.uploaded_by,
            jsonb_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status,
                'old_version', OLD.version,
                'new_version', NEW.version,
                'chunk_count', NEW.chunk_count
            )
        );
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (action_type, entity_type, entity_id, user_id, details)
        VALUES (
            'DOCUMENT_INGESTION',
            'engineering_documents',
            NEW.document_id::TEXT,
            NEW.uploaded_by,
            jsonb_build_object(
                'title', NEW.title,
                'file_name', NEW.file_name,
                'subsystem_id', NEW.subsystem_id,
                'mission_id', NEW.mission_id
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Attach Trigger to engineering_documents
DROP TRIGGER IF EXISTS trg_audit_document_lifecycle ON engineering_documents;
CREATE TRIGGER trg_audit_document_lifecycle
BEFORE INSERT OR UPDATE ON engineering_documents
FOR EACH ROW
EXECUTE FUNCTION fn_audit_document_change();

-- Trigger Function: Auto update timestamp on anomalies
CREATE OR REPLACE FUNCTION fn_update_anomaly_timestamp()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_anomaly_ts ON anomalies_incidents;
CREATE TRIGGER trg_update_anomaly_ts
BEFORE UPDATE ON anomalies_incidents
FOR EACH ROW
EXECUTE FUNCTION fn_update_anomaly_timestamp();

