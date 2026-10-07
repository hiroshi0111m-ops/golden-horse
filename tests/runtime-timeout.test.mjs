import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadTimeout() {
  const source = fs.readFileSync('scripts/gh_runtime_smoke.mjs', 'utf8');
  const helper = source.slice(source.lastIndexOf('\n', source.indexOf('function withTimeout(')) + 1, source.indexOf('\nfunction walk('));
  const pending = new Set();
  const scope = {setTimeout: (fn, ms) => {
    const timer = setTimeout(() => {pending.delete(timer); fn();}, ms);
    pending.add(timer);
    return timer;
  }, clearTimeout: timer => {pending.delete(timer); clearTimeout(timer);}};
  vm.createContext(scope);
  const run = vm.runInContext(helper + '\nwithTimeout', scope);
  return {run, pending, cleanup: () => {for (const t of pending) clearTimeout(t);}};
}

test('completed operations release their timeout timer', async () => {
  const {run, pending, cleanup} = loadTimeout();
  try {
    assert.equal(await run(Promise.resolve('done'), 1000, 'operation'), 'done');
    assert.equal(pending.size, 0);
  } finally {cleanup();}
});

test('unresponsive operations reject within their deadline', async () => {
  const {run, pending, cleanup} = loadTimeout();
  try {
    await assert.rejects(run(new Promise(() => {}), 10, 'body'), /body timeout after 10ms/);
    assert.equal(pending.size, 0);
  } finally {cleanup();}
});
