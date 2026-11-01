import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const temp = mkdtempSync(join(tmpdir(), 'daw-package-'));
try {
  const report = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], { encoding: 'utf8' }));
  const packed = Array.isArray(report) ? report[0] : report[pkg.name];
  assert(packed?.filename, 'npm pack did not produce an archive');
  const archive = join(temp, packed.filename);
  const paths = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  for (const p of paths) {
    assert(/^(package\/(package\.json|README\.md|LICENSE|NOTICE\.md)|package\/dist\/[\w./-]+\.(?:js|cjs|ts|cts|map))$/.test(p), 'Unexpected package file');
    assert(!p.includes('..') && !/test|fixture|private/i.test(p), 'Private or test artifact in package');
    const body = execFileSync('tar', ['-xOf', archive, p], { maxBuffer: 16 * 1024 * 1024 }).toString();
    assert(!/(?:\/Users\/|\/home\/)[A-Za-z0-9_.-]+\//.test(body), 'Machine-specific path in package');
    assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{30,}/.test(body), 'Credential-like content in package');
  }
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', temp, archive], { stdio: 'pipe' });
  const installed = join(temp, 'node_modules', pkg.name);
  const require = createRequire(join(temp, 'smoke.cjs'));
  const cjs = require(pkg.name);
  const esm = await import(pathToFileURL(join(installed, 'dist/index.js')).href);
  for (const api of [cjs, esm]) {
    assert.equal(typeof api.inspectSamples, 'function');
    assert.equal(typeof api.listSamples, 'function');
    assert.equal(typeof api[pkg.name === 'ts-als' ? 'parseAls' : 'parseFlp'], 'function');
    if (pkg.name === 'ts-als') {
      assert.equal(typeof api.copySamples, 'function');
      const bytes = gzipSync('<Ableton Creator="Ableton Live 12.1"><LiveSet/></Ableton>');
      assert(api.serializeAls(api.parseAls(bytes)).equals(bytes));
    }
  }
  for (const extension of ['mts', 'cts']) {
    const file = join(temp, `consumer.${extension}`);
    const parser = pkg.name === 'ts-als' ? 'parseAls' : 'parseFlp';
    writeFileSync(file, `import { ${parser}, inspectSamples } from '${pkg.name}';\nconst project = ${parser}(Buffer.alloc(0));\nvoid inspectSamples(project, { mode: 'resolve' });\n`);
    execFileSync(process.execPath, [join(process.cwd(), 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--types', 'node', '--typeRoots', join(process.cwd(), 'node_modules/@types'), file], { stdio: 'pipe' });
  }
  console.log(`Verified ${pkg.name}: ${paths.length} archive files; isolated npm install; ESM/CJS imports.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
