-- Migration 004: Make mission_id and subsystem_id optional on engineering_documents
-- Allows documents to be ingested without requiring a specific mission or subsystem selection.

ALTER TABLE engineering_documents ALTER COLUMN mission_id DROP NOT NULL;
ALTER TABLE engineering_documents ALTER COLUMN subsystem_id DROP NOT NULL;

-- Drop and recreate View: Document Vector Stats to gracefully handle nullable mission and subsystem
DROP VIEW IF EXISTS vw_document_vector_stats;
CREATE VIEW vw_document_vector_stats AS
SELECT 
    d.document_id,
    d.title,
    d.file_name,
    d.doc_type,
    COALESCE(m.mission_code, 'GENERAL')::VARCHAR(20) AS mission_code,
    COALESCE(s.code, 'GENERAL')::VARCHAR(20) AS subsystem_code,
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

-- Update Stored Function: match_spacecraft_knowledge to gracefully handle nullable mission and subsystem
CREATE OR REPLACE FUNCTION match_spacecraft_knowledge(
    query_embedding vector(384),
    match_threshold float DEFAULT 0.12,
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
    similarity FLOAT,
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

INSERT INTO schema_migrations (name) VALUES ('004_make_mission_subsystem_optional.sql') ON CONFLICT DO NOTHING;
