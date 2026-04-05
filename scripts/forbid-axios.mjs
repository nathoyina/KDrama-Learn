/**
 * Fail if the axios package is present (direct or in lockfile).
 * Use native fetch / undici in app code; avoid axios due to supply-chain concerns.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const lockPath = join(root, 'package-lock.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

let failed = false;

if (existsSync(pkgPath)) {
  const pkg = readJson(pkgPath);
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const deps = pkg[section];
    if (deps && Object.prototype.hasOwnProperty.call(deps, 'axios')) {
      console.error(`forbid-axios: remove "axios" from package.json ${section}`);
      failed = true;
    }
  }
}

if (existsSync(lockPath)) {
  const lock = readFileSync(lockPath, 'utf8');
  if (lock.includes('"node_modules/axios"')) {
    console.error('forbid-axios: axios appears in package-lock.json — remove the dependency that pulls it in');
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
