import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareIsolatedSendStorage, authorize } from '../reporting.mjs';

test('isolated renewal preserves existing files and creates unique protected token destinations', t => {
  // Windows PowerShell ACL inspection cannot see the test runner's sandbox Temp.
  const parent = process.platform === 'win32'
    ? fileURLToPath(new URL('../state/', import.meta.url)) : os.tmpdir();
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'isolated-send-auth-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const existing = path.join(root, 'existing');
  fs.mkdirSync(existing);
  const names = ['gmail-send-credentials.json', 'gmail-send-tokens.json', 'service-account.json', 'token.backup'];
  for (const name of names) fs.writeFileSync(path.join(existing, name), `fixture ${name}`);
  const before = names.map(name => {
    const file = path.join(existing, name);
    return { name, body: fs.readFileSync(file, 'utf8'), mtime: fs.statSync(file).mtimeMs, mode: fs.statSync(file).mode };
  });
  // Exercise path/file preservation with a protection spy. Real Windows ACL
  // subprocesses cannot inspect folders after sandbox token restrictions apply.
  const protectedPaths = [];
  const options = { credentialsPath: path.join(existing, names[0]), stateRoot: path.join(root, 'state'),
    secureStorage: dir => { assert.deepEqual(fs.readdirSync(dir), []); protectedPaths.push(dir); } };
  const first = prepareIsolatedSendStorage(options);
  const second = prepareIsolatedSendStorage(options);
  assert.notEqual(first.storageDir, second.storageDir);
  assert.deepEqual(protectedPaths, [first.storageDir, second.storageDir]);
  assert.equal(path.dirname(first.tokensPath), first.storageDir);
  assert.equal(path.basename(first.tokensPath), 'gmail-send-tokens.json');
  assert.equal(fs.existsSync(first.tokensPath), false);
  assert.deepEqual(fs.readdirSync(first.storageDir), []);
  assert.deepEqual(fs.readdirSync(existing).sort(), names.slice().sort());
  for (const item of before) {
    const file = path.join(existing, item.name);
    assert.equal(fs.readFileSync(file, 'utf8'), item.body);
    assert.equal(fs.statSync(file).mtimeMs, item.mtime);
    assert.equal(fs.statSync(file).mode, item.mode);
  }
});

test('isolated renewal rejects non-sending grants before OAuth or filesystem changes', async () => {
  await assert.rejects(authorize('sheets', { isolated: true }), { code: 'AUTH_KIND' });
});
