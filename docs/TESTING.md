# Testing and demonstration checklist

## Executed in the preparation environment
- `node --experimental-strip-types tests/unit.mjs`: PASS for correct/incorrect scrypt password, rejection of plaintext legacy hashes, valid and tampered session, role permissions, clearance ranking, deterministic 384-dimensional normalized vectors, and cosine self-similarity.
- TypeScript syntax transpilation: PASS for all TS/TSX application files (not a full dependency-aware typecheck).
- Mocked route checks: PASS for least-privilege signup and HTTP-only session cookie, unauthorized chat, missing Gemini key, Gemini server header, upload clearance, chunking, and denied writes. These use stand-ins, not a live database or Gemini service.
- Workspace visual preview at desktop and mobile: reviewed using mock data, not a running Next.js/PostgreSQL deployment.

## Not yet executed (requires npm dependencies, a live PostgreSQL+pgvector database and/or Gemini network credentials)
Record actual date, environment, inputs, results and screenshots here after execution. Do not mark these as passing until verified.

1. `npm ci`, `npm run db:seed` on a clean database and `npm run build`; run the app. Verify extension versions, schema, HNSW index, backfilled embeddings and no secrets in client bundle.
2. Login with admin and an invalid password; signup using a new username, name, valid email and 12+ character password; toggle show/hide password. Confirm duplicate account rejected, hash not plaintext, session signed and cookie HTTP-only. Logout, then protected endpoints must return 401.
3. As a new public user, verify writes and privileged incident/activity APIs return 403 even if requests are sent manually. Verify source list and chat expose only authorized documents; verify crafted delete requests cannot delete higher-clearance documents.
4. As admin, upload a text file with PUBLIC clearance and check indexed chunks, mission and subsystem. Send a relevant question; check Gemini response and inspect citations. Verify unauthorized/invalid Gemini key and no-results paths show helpful errors. Confirm SECRET/TOP_SECRET chunks never reach Gemini.
5. Upload empty and oversized text, an unsupported binary, missing mission/subsystem, and excessive title; confirm friendly rejections. Verify a failed chunk insert rolls back the entire ingestion transaction. Delete a disposable document via confirmation, verify chunks cascade and audit event appears.
6. As admin, create a disposable incident, verify SQL `INSERT`, then mark it resolved and verify SQL `UPDATE` and timestamp trigger. Query readiness and severity aggregations; examine SQL activity.
7. Demonstrate actual `CREATE`, `ALTER`, `DROP`, JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries, views, stored function and index on an isolated disposable database. Never demonstrate DROP on real data.
8. Capture sign-in, signup, knowledge chat with sources/chunks, upload, incidents, SQL activity, desktop/mobile screenshots. Add screenshots to your final report. Verify keyboard, focus, small screens and accessibility.
9. Record each team member's contribution and demonstrate the ER diagram, relational schema, justification, tests, source code history, limitations and original work.
