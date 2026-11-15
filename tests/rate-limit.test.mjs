import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRateLimiter} from '../rate-limit.js';

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('rate limiter rejects excess requests and resets at the window boundary', () => {
  let timestamp = 1000;
  const middleware = createRateLimiter({limit: 2, windowMs: 1000, now: () => timestamp});
  let passed = 0;
  for (let i = 0; i < 2; i++) middleware({ip: 'client'}, response(), () => passed++);
  const blocked = response();
  middleware({ip: 'client'}, blocked, () => passed++);
  assert.equal(passed, 2);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '1');

  timestamp = 2000;
  middleware({ip: 'client'}, response(), () => passed++);
  assert.equal(passed, 3);
});

test('rate limiter bounds client state and expires entries before rejecting new clients', () => {
  let timestamp = 0;
  const middleware = createRateLimiter({limit: 1, windowMs: 100, maxClients: 1, now: () => timestamp});
  middleware({ip: 'first'}, response(), () => {});

  const full = response();
  middleware({ip: 'second'}, full, () => {});
  assert.equal(full.statusCode, 429);

  timestamp = 100;
  middleware({ip: 'second'}, response(), () => {});
});

test('server rate-limits requests before serving filesystem-backed static files', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /app\.use\(createRateLimiter\(\)\);\s*app\.use\(express\.static/);
  assert.match(server, /app\.get\('\/\{\*path\}'/);
  assert.match(server, /const indexHtml = readFileSync\(join\(distDir, 'index\.html'\), 'utf8'\)/);
  assert.match(server, /res\.type\('html'\)\.send\(indexHtml\)/);
});
