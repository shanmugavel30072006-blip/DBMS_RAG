# DBMS Level 3 requirements traceability

This is a source-code assessment against the included `DBMS Level 3 Mini_Project Requirements draft.docx`, not a claim of a successful live deployment. The project uses **Option 2: PostgreSQL relational tables + the pgvector vector paradigm**. Database documentation is in `DESIGN.md`, setup in `README.md`, and runnable/manual checks in `TESTING.md`.

| Requirement | Evidence | Status / remaining action |
|---|---|---|
| SQL + vector | `database/schema.sql`, vector(384), HNSW; `lib/db.ts` | Implemented; execute against PostgreSQL with pgvector to verify. |
| ER, schema, keys, relationships, data dictionary | `DESIGN.md`, `database/schema.sql` | Documented; review ER in team presentation. |
| CREATE, ALTER, DROP, constraints, indexes, views | `schema.sql`; `migrations/001_username_login.sql` and `002_case_insensitive_users.sql` | Implemented; DROP in schema is destructive, never run on existing data. ALTER runs on upgrade. |
| INSERT, UPDATE, DELETE, SELECT, joins, grouping, HAVING, subqueries, ORDER BY | `lib/db.ts`, `database/seed.sql`, `DESIGN.md` | Implemented; integration execution pending. |
| Four advanced concepts | Transactions (`lib/pg.ts`), 3 views, stored function, triggers, HNSW index and vector similarity (`schema.sql`, `lib/db.ts`) | Implemented; live DB proof pending. |
| Embedding model, metadata, index, retrieval | `lib/embeddings.ts`, `document_chunks`, `DESIGN.md` | Implemented as deterministic hash vectors, not an ML language model. |
| Functional Next.js interface and API integration | `app/page.tsx`, `app/login/page.tsx`, `app/api/*` | Implemented; installation, build, UI, database and Gemini end-to-end tests pending. |
| Auth and 2+ roles | `lib/auth.ts`, `lib/session.ts`, signup/login and protected APIs | Implemented; least-privilege self-registration. Production hardening remains. |
| Validation, integrity, no plaintext secrets | SQL checks/FKs; upload/signup checks; `scrypt`, `.env.example` | Implemented in relevant paths; additional limits and hardening needed before deployment. |
| Problem, objectives, scope, architecture, queries, conclusion | `DESIGN.md` | Documented. |
| App screenshots and test results | `TESTING.md` | Source-level/unit checks recorded; capture actual running app screenshots and execute test plan. |
| GitHub and individual contributions | Supplied repo | Team must make and document their own commits and contributions; not invented. |
| Originality and final demonstration | Team responsibility | Confirm originality, rehearse presentation, validate requirement compliance and complete evidence. |

**Known gaps:** PDF/DOCX ingestion, persistent conversational context, email verification, password recovery, production-rate limiting and live environment verification are not implemented. The UI uses sample content from the existing database seed; it must be reviewed for suitability and factual accuracy before demonstration.
