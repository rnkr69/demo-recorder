// Pure spec helpers in run.js: env substitution, step slicing, arg normalisation,
// option mapping and the preflight host-mismatch warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __test } from '../../src/run.js';

const { subEnv, sliceSteps, norm, sessionOpts, preflight, runStep } = __test;

// A driver stub that records (method, args) for every call, so we can assert how runStep maps a
// declarative step to a Driver call without a real browser.
function recorder() {
  const calls = [];
  const handler = {
    get: (_t, prop) => (...args) => { calls.push([prop, ...args]); },
  };
  return { d: new Proxy({}, handler), calls };
}

test('subEnv substitutes ${VAR} from the environment', () => {
  process.env.DR_TEST_VAR = 'bar';
  try {
    assert.equal(subEnv('${DR_TEST_VAR}/x'), 'bar/x');
  } finally { delete process.env.DR_TEST_VAR; }
});

test('subEnv replaces a missing var with empty string', () => {
  delete process.env.DR_MISSING_VAR;
  assert.equal(subEnv('a${DR_MISSING_VAR}b'), 'ab');
});

test('subEnv recurses into arrays and objects, leaves non-strings alone', () => {
  process.env.DR_TEST_VAR = 'X';
  try {
    assert.deepEqual(
      subEnv({ a: '${DR_TEST_VAR}', b: ['${DR_TEST_VAR}', 1], c: true, d: null }),
      { a: 'X', b: ['X', 1], c: true, d: null },
    );
  } finally { delete process.env.DR_TEST_VAR; }
});

test('sliceSteps returns the same array when no range is given', () => {
  const steps = [{ a: 1 }, { b: 2 }];
  assert.equal(sliceSteps(steps, null, null), steps); // same reference, no copy
});

test('sliceSteps is 1-based inclusive', () => {
  const steps = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(sliceSteps(steps, 2, 4), ['b', 'c', 'd']);
  assert.deepEqual(sliceSteps(steps, 3, null), ['c', 'd', 'e']); // from only
  assert.deepEqual(sliceSteps(steps, null, 2), ['a', 'b']);      // to only
});

test('norm wraps a bare string as { sel }', () => {
  assert.deepEqual(norm('button.send'), { sel: 'button.send' });
  assert.deepEqual(norm({ sel: 'x', ms: 3 }), { sel: 'x', ms: 3 });
  assert.deepEqual(norm(undefined), {});
  assert.deepEqual(norm(null), {});
});

test('sessionOpts maps spec keys (out→outDir, route→routes) with defaults', () => {
  assert.equal(sessionOpts({}).outDir, 'out');
  const o = sessionOpts({ out: 'dist', width: 100, route: [{ url: 'x' }], waitTimeout: 5 });
  assert.equal(o.outDir, 'dist');
  assert.equal(o.width, 100);
  assert.deepEqual(o.routes, [{ url: 'x' }]);
  assert.equal(o.waitTimeout, 5);
});

test('preflight stays silent without a url or APP_URL', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const prev = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    preflight({});
    preflight({ url: 'http://localhost:4317' }); // no APP_URL to compare against
    assert.equal(warn.mock.callCount(), 0);
  } finally { if (prev !== undefined) process.env.APP_URL = prev; }
});

test('preflight warns on the 127.0.0.1 ↔ localhost cookie trap', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const prev = process.env.APP_URL;
  process.env.APP_URL = 'http://127.0.0.1:4317';
  try {
    preflight({ url: 'http://localhost:4317' });
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /trampa 127\.0\.0\.1/);
  } finally {
    if (prev !== undefined) process.env.APP_URL = prev; else delete process.env.APP_URL;
  }
});

test('runStep rejects a step without exactly one action key', async () => {
  const { d } = recorder();
  await assert.rejects(() => runStep(d, {}), /exactly one action/);
  await assert.rejects(() => runStep(d, { move: 'a', click: 'b' }), /exactly one action/);
  await assert.rejects(() => runStep(d, { bogus: 1 }), /unknown step action/);
});

test('runStep maps move with bare string and pulls trail/overshoot opts out', async () => {
  const { d, calls } = recorder();
  await runStep(d, { move: 'btn' });
  assert.deepEqual(calls[0], ['moveTo', 'btn', undefined, {}]);
  calls.length = 0;
  await runStep(d, { move: { sel: 'btn', ms: 500, trail: true, overshoot: true } });
  assert.deepEqual(calls[0], ['moveTo', 'btn', 500, { trail: true, overshoot: true }]);
});

test('runStep threads click variants (variant/ripple/pop) into the click opts', async () => {
  const { d, calls } = recorder();
  await runStep(d, { click: { sel: 'x', variant: 'double', ripple: true, pop: true } });
  assert.deepEqual(calls[0], ['click', 'x', { nav: false, ms: undefined, zoom: undefined, variant: 'double', ripple: true, pop: true }]);
});

test('runStep dispatches the new in-page effect steps', async () => {
  const { d, calls } = recorder();
  await runStep(d, { spotlight: { sel: 'table', dim: 0.5 } });
  await runStep(d, { spotlightOff: true });
  await runStep(d, { keycap: 'cmd+k' });
  await runStep(d, { scroll: { sel: '#row', ms: 600 } });
  assert.deepEqual(calls[0], ['spotlight', 'table', { dim: 0.5 }]);
  assert.deepEqual(calls[1], ['spotlightOff']);
  assert.deepEqual(calls[2], ['keycap', 'cmd+k', {}]);
  assert.deepEqual(calls[3], ['scrollTo', '#row', { ms: 600 }]);
});

test('runStep accepts both `key` and `keycap`, string or {label}', async () => {
  const { d, calls } = recorder();
  await runStep(d, { key: 'enter' });
  await runStep(d, { keycap: { label: 'shift+a', ms: 900 } });
  assert.deepEqual(calls[0], ['keycap', 'enter', {}]);
  assert.deepEqual(calls[1], ['keycap', 'shift+a', { label: 'shift+a', ms: 900 }]);
});

test('runStep dispatches the phase-2 steps (annotate/highlight/chapter)', async () => {
  const { d, calls } = recorder();
  await runStep(d, { annotate: { sel: 'btn', shape: 'arrow', text: 'aquí', side: 'top' } });
  await runStep(d, { annotateOff: true });
  await runStep(d, { highlight: { sel: 'p', mode: 'underline' } });
  await runStep(d, { chapter: '1. Pregunta' });
  assert.deepEqual(calls[0], ['annotate', 'btn', { shape: 'arrow', text: 'aquí', side: 'top' }]);
  assert.deepEqual(calls[1], ['annotateOff']);
  assert.deepEqual(calls[2], ['highlight', 'p', { mode: 'underline' }]);
  assert.deepEqual(calls[3], ['chapter', '1. Pregunta']);
});

test('preflight does not warn when hosts match', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const prev = process.env.APP_URL;
  process.env.APP_URL = 'http://localhost:4317';
  try {
    preflight({ url: 'http://localhost:4317' });
    assert.equal(warn.mock.callCount(), 0);
  } finally {
    if (prev !== undefined) process.env.APP_URL = prev; else delete process.env.APP_URL;
  }
});
