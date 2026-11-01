import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
const files = git('ls-files', '-z').split('\0').filter(Boolean);
assert(files.length > 0, 'No staged/tracked public files');
function inspect(name, body) {
  assert(!/(?:^|\/)(?:node_modules|dist|coverage|\.reviewbox|\.codex|\.claude|\.agents|outputs)(?:\/|$)|(?:^|\/)\.env|\.(?:als|flp|xml|wav|aiff?|mp3|flac|ogg|m4a|zip|tgz|log|pem|key)$/i.test(name), 'Private/generated file in public tree');
  assert(!name.startsWith('test_projs/') || name === 'test_projs/README.md', 'Private fixture in public tree');
  assert(!/(?:\/Users\/|\/home\/)[A-Za-z0-9_.-]+\//.test(body), 'Machine-specific path in public tree');
  assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{30,}/.test(body), 'Credential-like content in public tree');
}
for (const name of files) inspect(name, git('show', `:${name}`));
// Audit every reachable commit, not only the current checkout.
let commits = [];
try { git('rev-parse', '--verify', 'HEAD'); commits = git('rev-list', '--all').trim().split('\n').filter(Boolean); } catch { /* Initial commit has not been created yet. */ }
const seen = new Set();
for (const commit of commits) {
  for (const entry of git('ls-tree', '-r', '-z', commit).split('\0').filter(Boolean)) {
    const [meta, name] = entry.split('\t');
    const hash = meta.split(' ')[2];
    const key = `${name}:${hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inspect(name, git('cat-file', 'blob', hash));
  }
}
console.log(`Public tree checked: ${files.length} staged files; ${commits.length} commits; no forbidden paths or credential patterns.`);
