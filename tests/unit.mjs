import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { hashPassword, verifyPassword, createSessionToken, readSessionToken, canIngestDocuments, canResolveAnomalies, isAdmin } from '../lib/auth.ts';
import { generateEmbedding, calculateCosineSimilarity } from '../lib/embeddings.ts';
import { parseDocumentText } from '../lib/document-parser.ts';
import { hashKey, maskKey, encryptKey, decryptKey } from '../lib/provider-crypto.ts';
import { synthesizeDefaultChunkAnswer } from '../lib/rag-synthesis.ts';

process.env.SESSION_SECRET = 'unit-test-only-secret-0123456789abcdef';
const password = 'test-passphrase-123';
const hash = hashPassword(password);
assert.ok(hash.startsWith('scrypt$'));
assert.equal(verifyPassword(password, hash), true);
assert.equal(verifyPassword('wrong', hash), false);
assert.equal(verifyPassword(password, 'plaintext'), false);
const token = createSessionToken(7);
assert.equal(readSessionToken(token), 7);
assert.equal(readSessionToken(token + 'tampered'), null);
assert.equal(canIngestDocuments(), true);
assert.equal(canResolveAnomalies(), true);
assert.equal(isAdmin({ username: 'admin' }), true);
assert.equal(isAdmin({ username: 'ADMIN' }), true);
assert.equal(isAdmin({ username: 'user' }), false);
assert.equal(isAdmin(null), false);
const a = generateEmbedding('cryogenic propulsion pressure control');
assert.equal(a.length, 384);
assert.deepEqual(a, generateEmbedding('cryogenic propulsion pressure control'));
assert.ok(Math.abs(Math.sqrt(a.reduce((sum, x) => sum + x * x, 0)) - 1) < .0001);
assert.ok(calculateCosineSimilarity(a, a) > .999);

// Document parser unit tests
const txtSample = await parseDocumentText('test.txt', Buffer.from('Propulsion subsystem telemetry'));
assert.equal(txtSample, 'Propulsion subsystem telemetry');

if (existsSync('DBMS Level 3 Mini_Project Requirements draft.docx')) {
  const docxBuf = readFileSync('DBMS Level 3 Mini_Project Requirements draft.docx');
  const docxText = await parseDocumentText('sample.docx', docxBuf);
  assert.ok(docxText.length > 100);
  assert.ok(docxText.includes('DBMS'));
}

// Provider crypto unit tests (AES-256-GCM encryption + SHA-256 hashing + masking)
const testApiKey = 'AIzaSyD-1234567890abcdefABCDEF123456';
const testHash = hashKey(testApiKey);
assert.equal(testHash.length, 64);
assert.equal(testHash, hashKey(testApiKey)); // deterministic
assert.notEqual(testHash, hashKey('AIzaSyD-different-key'));

const masked = maskKey(testApiKey);
assert.ok(masked.startsWith('AIza'));
assert.ok(masked.endsWith('3456'));
assert.ok(masked.includes('••••'));
assert.equal(maskKey('short'), '••••••••••••••••');

const encrypted = encryptKey(testApiKey);
assert.ok(encrypted.includes(':'));
const decrypted = decryptKey(encrypted);
assert.equal(decrypted, testApiKey);

// Tamper resistance test for GCM
assert.throws(() => {
  const [iv, tag, cipher] = encrypted.split(':');
  const tamperedCipher = '00' + cipher.slice(2);
  decryptKey(`${iv}:${tag}:${tamperedCipher}`);
});

// Default RAG chunk synthesis unit test
const fakeChunks = [
  {
    chunk_id: 'c1',
    document_id: 10,
    document_title: 'Artemis Cryogenic Guide',
    file_name: 'artemis_cryo.pdf',
    subsystem: 'PROPULSION',
    mission: 'ARTEMIS',
    text: 'Liquid oxygen (LOX) tank pressure must be kept below 52 psia. Active TVS venting initiates at 50 psia to avoid relief valve activation.',
    similarity: 0.88,
    chunk_index: 1,
  },
  {
    chunk_id: 'c2',
    document_id: 10,
    document_title: 'Artemis Cryogenic Guide',
    file_name: 'artemis_cryo.pdf',
    subsystem: 'PROPULSION',
    mission: 'ARTEMIS',
    text: 'LH2 boiloff venting is controlled via redundant solenoids. Continuous telemetry monitoring is mandatory during orbital coast.',
    similarity: 0.79,
    chunk_index: 2,
  }
];

const synthesisAnswer = synthesizeDefaultChunkAnswer('What is the pressure limit for LOX tanks?', fakeChunks);
assert.ok(synthesisAnswer.includes('Artemis Cryogenic Guide'));
assert.ok(synthesisAnswer.includes('Chunk 1'));
assert.ok(synthesisAnswer.includes('[Source 1]'));
assert.ok(synthesisAnswer.includes('Default Chunk Retrieval Engine'));

console.log('PASS: password hashing, sessions, access checks, document parser, deterministic vectors, AES-256-GCM crypto & RAG synthesis');
