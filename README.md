# Cosmos: spacecraft engineering knowledge workspace

A Next.js application for role-controlled spacecraft documents, pgvector retrieval, Gemini-grounded answers and an incident register. The `docs/` folder maps the implementation to the supplied Level 3 requirements and calls out work that still requires a real environment or the project team.

## Prerequisites

- Node.js **22.18+** (needed by the seed script's native TypeScript stripping), npm, and PostgreSQL 15+ with the **pgvector** extension installed (0.5+ for HNSW). The database user needs permission to create `vector` and `uuid-ossp` extensions.
- A Gemini API key, internet access from the Next.js server, and a Gemini model enabled for your account.

## Quick Start with Docker (Recommended)

Run the entire stack (Next.js application + PostgreSQL 16 with pgvector) in isolated containers with automatic schema creation, demo account seeding, and vector backfilling:

1. **Configure environment**:
   ```bash
   cp .env.docker.example .env
   ```
   Edit `.env` and set your `GEMINI_API_KEY` (and optionally adjust passwords or ports).

2. **Start the containers**:
   ```bash
   docker compose up -d --build
   ```

3. **Verify and access**:
   - Web application: Open [http://localhost:3000](http://localhost:3000)
   - Health check: `curl http://localhost:3000/api/health`
   - Default sign-in: Username `admin` with `ADMIN_PASSWORD` set in `.env` (or `user` with `USER_PASSWORD`)
   - Container logs: `docker compose logs -f`
   - Stop containers: `docker compose down` (use `-v` to also remove the database volume)

---

## Local Setup (Without Docker)

1. Create a **new, empty database** named `astrorag` (for example, `createdb astrorag`). Do not point this project at a production database.
2. Copy `.env.example` to `.env.local`. Set `DATABASE_URL`, a random `SESSION_SECRET` of at least 32 characters, `ADMIN_PASSWORD`, `USER_PASSWORD`, and a **new** `GEMINI_API_KEY`. Do not reuse a key that was shared in chat or committed anywhere. The key is used only by the server route, never embedded in client JavaScript.
3. Run `npm ci`, then `npm run db:seed`. The bootstrap applies `database/schema.sql` and `database/seed.sql` only when the public schema is empty. **schema.sql contains DROP statements and will destroy matching objects if run directly**. The script refuses to apply it to a non-empty public schema. Existing supported databases receive migrations; case-insensitive duplicate usernames/emails must be resolved manually first. The seed script provisions `admin` and `user` with scrypt password hashing and backfills embeddings. Passwords come from your local environment, not this repository.
4. Run `npm run dev`, open `http://localhost:3000`, then sign in with `admin` and `ADMIN_PASSWORD` (or `user` with `USER_PASSWORD`).
5. In **Knowledge chat**, select **Add document** and upload `.txt` or `.md` text (or paste text), choose a mission, subsystem and clearance, then index. Ask a question; sources are shown beneath each answer. A Google API key must be configured even when no matches are found. New self-service accounts are always **MISSION_CONTROLLER / PUBLIC**, so an authorized demo account must add public documents if they need to use them.

For production build: `npm run build && npm start`. If you modify the schema on an existing installation, take backups and run reviewed migrations separately. `npm run db:seed` is not a general-purpose production migration tool.

## Behavior and limits

- Authentication: scrypt hashes and signed, HTTP-only, same-site session cookies. Signup cannot choose its own role or clearance. Existing privileged accounts are provisioned by seed/config; there is no admin UI for granting roles.
- Authorization: server checks control document writes, clearance-filtered reads/deletes, incident access, and database activity. Incident/SQL dashboards require TOP_SECRET. A flight director or chief engineer can upload and delete documents, subject to clearance. Signup is read-only.
- Documents: plain `.txt` / `.md` and pasted text only, up to 500,000 characters. The list shows the most recent 15 accessible documents. Upload stores indexed text chunks and derived vectors, not the original binary. Chunking uses overlapping character windows.
- Retrieval: 384-dimensional deterministic token/ngram hash vectors, **not a trained all-MiniLM model**, stored in PostgreSQL/pgvector. Cosine distance identifies matching chunks. Hash collisions and the fixed similarity threshold can reduce quality; use citations and verify claims.
- Gemini: up to five retrieved chunks are sent to the external Google API, along with the user's question. Only PUBLIC or CONFIDENTIAL documents at or below the user's clearance are eligible; SECRET and TOP_SECRET chunks are deliberately excluded even for privileged users. Do not upload or send sensitive material without your organization's approval. Model output can be incorrect. The current chat is session-local and each question is independent; no conversation history is persisted or included in follow-up prompts.
- Security limitations: this is a mini-project, not production-ready identity infrastructure. Add login/signup rate limits, CSRF/origin protection, audit review, password reset and revocable sessions, managed secret storage, security headers, content limits enforced at the proxy, and deployment-specific monitoring before public deployment. There is no email verification or account recovery.

## Validation

`node --experimental-strip-types tests/unit.mjs` tests hashing, session signing/tampering, basic role checks, and vector generation. `npm run build` plus the integration cases in `docs/TESTING.md` must be run with installed dependencies, a PostgreSQL+pgvector server, and Gemini credentials. Environment-specific tests and final screenshots are not claimed as complete.
