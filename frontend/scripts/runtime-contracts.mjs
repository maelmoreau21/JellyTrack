import assert from 'node:assert/strict';
import { createAPI } from '../src/lib/runtime/api.ts';

// Exercise the extracted client without any network or real credentials.
const originalFetch = globalThis.fetch;
const state = { locale: 'fr', user: { csrfToken: 'fixture-token' }, pageController: new AbortController() };
let updates = 0;
const destinations = [];
const api = createAPI(state, () => updates++, path => destinations.push(path));
let checks = 0;
try {
  let request;
  globalThis.fetch = async (url, options) => { request = { url, options }; return Response.json({ ok: true }); };
  await api.request('/api/fixture', { method: 'post', headers: new Headers({ 'X-Fixture': 'preserved' }), body: { id: 'server-a' } });
  assert.equal(request.options.headers.get('X-CSRF-Token'), 'fixture-token');
  assert.equal(request.options.headers.get('X-Fixture'), 'preserved');
  assert.equal(request.options.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), { id: 'server-a' }); checks++;

  const form = new FormData(); form.set('name', 'fixture');
  for (const body of [form, new Blob(['fixture']), new ArrayBuffer(2), new Uint8Array([1, 2]), new URLSearchParams({ name: 'fixture' })]) {
    await api.request('/api/fixture', { method: 'PUT', body });
    assert.equal(request.options.body, body);
    assert.equal(request.options.headers.get('Content-Type'), null);
    assert.equal(request.options.headers.get('X-CSRF-Token'), 'fixture-token');
  } checks++;

  globalThis.fetch = async (_url, options) => {
    assert.notEqual(options.signal, state.pageController.signal);
    return new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (options.signal.aborted) abort(); else options.signal.addEventListener('abort', abort, { once: true });
    });
  };
  const pending = api.getJSON('/api/fixture');
  state.pageController.abort();
  await assert.rejects(pending, { name: 'AbortError' }); checks++;

  const explicit = new AbortController();
  globalThis.fetch = async (_url, options) => { assert.equal(options.signal.aborted, false); return Response.json({ ok: true }); };
  assert.deepEqual(await api.getJSON('/api/fixture', { signal: explicit.signal }), { ok: true }); checks++;

  globalThis.fetch = async () => Response.json({ error: 'fixture denied' }, { status: 401 });
  assert.equal((await api.request('/api/auth/me')).status, 401);
  assert.equal(updates, 0);
  await assert.rejects(api.request('/api/private'), /Session expirée/);
  assert.equal(state.user, null); assert.equal(updates, 1); assert.deepEqual(destinations, ['/login']); checks++;

  state.pageController = new AbortController();
  globalThis.fetch = async () => Response.json({ error: 'fixture forbidden' }, { status: 403 });
  await assert.rejects(api.getJSON('/api/private'), /fixture forbidden/);
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  await assert.rejects(api.getJSON('/api/private'), /Erreur HTTP 503/); checks++;
  const originalSetTimeout = globalThis.setTimeout;
  try {
    globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, delay === 30000 ? 0 : delay, ...args);
    globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    await assert.rejects(api.getJSON('/api/slow'), /Le serveur ne répond pas/); checks++;
  } finally { globalThis.setTimeout = originalSetTimeout; }
  console.log(`PASS ${checks} runtime API contracts; no network requests`);
} finally { globalThis.fetch = originalFetch; }
