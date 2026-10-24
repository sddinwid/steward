import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { canonical, digest, signPackage } from '../packages/module-sdk/dist/index.js';
const source = path.resolve(process.argv[2] ?? 'modules/inventory');
const directory = path.resolve(process.argv[3] ?? '.steward/dev');
try {
  const sourcePackage=JSON.parse(await readFile(path.join(source,'package.json'),'utf8'));
  if(['steward-platform','@steward/platform'].some(name=>sourcePackage.dependencies?.[name]))throw new Error('Independent module packages must not depend on the Steward core');
  const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  const migrations = (await readdir(path.join(source, 'migrations'))).filter(f => /^\d{3}-[a-z-]+\.sql$/.test(f)).sort();
  manifest.persistence.migrations = await Promise.all(migrations.map(async (f, i) => ({ version: i + 1, sha256: digest(await readFile(path.join(source, 'migrations', f), 'utf8')) })));
  manifest.persistence.schemaVersion = migrations.length;
  const image = `${manifest.moduleId}:${manifest.version}`;
  execFileSync('docker', ['build', '-f', path.join(source, 'Dockerfile'), '-t', image, process.cwd()], { stdio: 'inherit' });
  const imageId = JSON.parse(execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }))[0].Id;
  const descriptor = signPackage({ formatVersion: 1, publisherId: 'local-operator', imageId, manifest }, await readFile(path.join(directory, 'security', 'module-publisher-key.pem'), 'utf8'));
  const catalogFile = path.join(directory, 'modules/public/catalog.json');
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  const existing = catalog.packages.find(d => d.payload.manifest.moduleId === manifest.moduleId && d.payload.manifest.version === manifest.version);
  if (existing && canonical(existing) !== canonical(descriptor)) throw new Error('A published version is immutable; publish a new version');
  if (!existing) catalog.packages.push(descriptor);
  // The directory is mounted read-only into runtimes. Write existing inode so all readers see publication.
  await writeFile(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Published signed package ${manifest.moduleId}@${manifest.version}, image ${imageId}. No Worker core was rebuilt or restarted.`);
} catch (e) { console.error(e.message); process.exitCode = 1; }
