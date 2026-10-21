import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const entrypoint = resolve('dist/server/entry.mjs');

test('production server serves the CMS and protects administration', { timeout: 45000 }, async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'emdash-http-'));
  await mkdir(join(temporaryDirectory, 'uploads'));
  const reservation = createServer();
  await new Promise((done) => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  const origin = `http://127.0.0.1:${port}`;
  let logs = '';
  const server = spawn(process.execPath, [entrypoint], {
    cwd: temporaryDirectory,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      EMDASH_SITE_URL: origin,
      EMDASH_ENCRYPTION_KEY: `emdash_enc_v1_${randomBytes(32).toString('base64url')}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { logs += chunk; });
  server.stderr.on('data', (chunk) => { logs += chunk; });
  try {
    let reachable = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) assert.fail(`Server exited early: ${logs}`);
      try {
        const response = await fetch(origin);
        if (response.status === 200) { reachable = true; break; }
      } catch { /* The server may still be starting. */ }
      await new Promise((done) => setTimeout(done, 200));
    }
    assert.ok(reachable, `Server did not become ready: ${logs}`);

    await t.test('Japanese landing page links to real CMS routes', async () => {
      const response = await fetch(origin);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /lang="ja"/);
      assert.match(html, /href="\/_emdash\/admin\/"/);
      assert.match(html, /href="\/emdash-test\/"/);
    });

    await t.test('published-post query has an honest empty state', async () => {
      const response = await fetch(`${origin}/emdash-test/`);
      assert.equal(response.status, 200, await response.clone().text());
      assert.match(await response.text(), /公開済みの記事はまだありません/);
    });

    await t.test('only published titles render, with HTML escaped', async () => {
      // Fixture data belongs only to this test's temporary database.
      const database = new DatabaseSync(join(temporaryDirectory, 'data.db'));
      try {
        const insert = database.prepare(
          'INSERT INTO ec_posts (id, slug, status, title, content, published_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        insert.run('test-published', 'published', 'published', '公開確認 <script>alert(1)</script>', '[]', new Date().toISOString());
        insert.run('test-draft', 'draft', 'draft', 'PRIVATE_DRAFT_TITLE', '[]', null);
      } finally {
        database.close();
      }
      const response = await fetch(`${origin}/emdash-test/`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /公開確認 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.doesNotMatch(html, /PRIVATE_DRAFT_TITLE/);
      assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    });

    await t.test('setup remains unclaimed for the owner', async () => {
      const response = await fetch(`${origin}/_emdash/api/setup/status`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.needsSetup, true);
      assert.equal(body.data.authMode, 'passkey');
    });

    await t.test('administrator interface serves a React application', async () => {
      const response = await fetch(`${origin}/_emdash/admin/`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /EmDash/);
      assert.match(html, /<script/);
    });

    await t.test('unauthenticated administration cannot list users', async () => {
      const response = await fetch(`${origin}/_emdash/api/admin/users`);
      assert.ok([401, 403].includes(response.status), `Expected 401/403; received ${response.status}`);
    });
  } finally {
    server.kill('SIGTERM');
    await new Promise((done) => {
      if (server.exitCode !== null) return done();
      server.once('exit', done);
    });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
