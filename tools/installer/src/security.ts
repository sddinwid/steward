import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm, rmdir, stat, chmod } from 'node:fs/promises';
import path from 'node:path';
import type { Manifest } from './provision.js';

const quote = (s: string) => JSON.stringify(s.replaceAll('\\', '/'));
async function exists(p: string) { try { await stat(p); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } }
function openssl(args: string[], configFile: string) {
  const executable = process.env.STEWARD_OPENSSL ?? (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
  execFileSync(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, env: { ...process.env, OPENSSL_CONF: configFile, MSYS_NO_PATHCONV: '1' } });
}
function pair() {
  const keys = generateKeyPairSync('ed25519');
  return { privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}
export function privateDirectory(directory: string) {
  if (process.platform !== 'win32') return;
  const identity = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' }).match(/S-1-(?:\d+-)+\d+/)?.[0];
  if (!identity) throw new Error('Cannot establish the current Windows security principal');
  execFileSync('icacls', [directory, '/inheritance:r', '/grant:r', `*${identity}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { stdio: ['ignore', 'pipe', 'pipe'] });
}
function nginx(key: string) {
  return `server {
  listen 8443 ssl;
  server_name ${key}.localhost;
  ssl_certificate /run/secrets/tls_cert;
  ssl_certificate_key /run/secrets/tls_key;
  ssl_protocols TLSv1.3;
  server_tokens off;
  root /usr/share/nginx/html;
  resolver 127.0.0.11 valid=5s ipv6=off;
  set $secure_backend https://api:3443;
  set $local_backend http://api:3000;
  proxy_ssl_trusted_certificate /run/secrets/trust_ca;
  proxy_ssl_verify on;
  proxy_ssl_server_name on;
  proxy_ssl_name ${key}-api;
  proxy_ssl_protocols TLSv1.3;
  proxy_connect_timeout 3s;
  proxy_read_timeout 10s;
  proxy_set_header Host $host;
  add_header Cache-Control no-store always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy no-referrer always;
  add_header X-Frame-Options DENY always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
  location /api/v2/ { proxy_pass $secure_backend; }
  location /api/ { proxy_pass $local_backend; }
  location = /health { proxy_pass $local_backend; }
  location = /ready { proxy_pass $local_backend; }
  location / { try_files $uri $uri/ /index.html; }
}
`;
}
export async function provisionSecurity(directory: string, sourceRoot: string, trustFile?: string) {
  directory = path.resolve(directory);
  const manifest: Manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.provisionerVersion !== 1 || !['0.1.0', '0.2.0', '0.3.0', '0.4.0'].includes(manifest.release)) throw new Error('Unsupported base deployment');
  const target = path.join(directory, 'security');
  const lock = path.join(directory, '.security-provision-lock');
  await mkdir(lock);
  let staging: string | undefined;
  try {
    const deploymentHash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    if (await exists(target)) {
      const existing = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'));
      if (existing.version !== 1 || existing.deploymentHash !== deploymentHash) throw new Error('Security deployment does not match installation manifest');
      for (const i of manifest.instances) for (const file of ['identity-key.pem', 'tls-key.pem', 'tls-cert.pem', 'security.json', 'nginx.conf']) await readFile(path.join(target, i.key, file));
      for (const file of ['ca-cert.pem', 'compose.yaml', 'master-trust.json']) await readFile(path.join(target, file));
      if (trustFile) throw new Error('Trust changes require explicit operator review; existing trust was preserved');
      privateDirectory(target);
      return false;
    }
    staging = await mkdtemp(path.join(directory, '.security-staging-'));
    privateDirectory(staging);
    const opensslConfig = path.join(staging, 'openssl.cnf');
    await writeFile(opensslConfig, '[req]\ndistinguished_name=req_dn\n[req_dn]\n');
    openssl(['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-days', '365', '-subj', '/CN=Steward local development CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', path.join(staging, 'ca-key.pem'), '-out', path.join(staging, 'ca-cert.pem')], opensslConfig);
    await chmod(path.join(staging, 'ca-key.pem'), 0o600);
    const caCertificate = await readFile(path.join(staging, 'ca-cert.pem'), 'utf8');
    const identityKeys = new Map(manifest.instances.map(i => [i.key, pair()]));
    const master = manifest.instances.find(i => i.role === 'master');
    const trust = master ? {
      profileId: 'master', apiUrl: 'https://master-api:3443', browserUrl: `https://master.localhost:${master.webPort + 1000}`,
      installationId: master.installationId, publicKey: identityKeys.get(master.key)!.publicKey, caCertificate
    } : trustFile ? JSON.parse(await readFile(trustFile, 'utf8')) : null;
    if (trust && (!trust.caCertificate?.includes('BEGIN CERTIFICATE') || !trust.publicKey?.includes('BEGIN PUBLIC KEY') || !trust.apiUrl?.startsWith('https://') || !trust.browserUrl?.startsWith('https://'))) throw new Error('Invalid operator trust bundle');
    await writeFile(path.join(staging, 'master-trust.json'), JSON.stringify(trust, null, 2) + '\n');
    if (trust) await writeFile(path.join(staging, 'master-ca.pem'), trust.caCertificate);
    const services: string[] = [];
    const secrets: string[] = [`  security-ca:\n    file: ${quote(path.join(target, 'ca-cert.pem'))}`];
    for (const i of manifest.instances) {
      const base = path.join(staging, i.key);
      const finalBase = path.join(target, i.key);
      await mkdir(base, { mode: 0o700 });
      await writeFile(path.join(base, 'identity-key.pem'), identityKeys.get(i.key)!.privateKey, { mode: 0o444 });
      openssl(['req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-subj', `/CN=${i.key}.localhost`, '-keyout', path.join(base, 'tls-key.pem'), '-out', path.join(base, 'tls.csr')], opensslConfig);
      await writeFile(path.join(base, 'extensions.cnf'), `subjectAltName=DNS:${i.key}.localhost,DNS:${i.key}-api,DNS:api\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\n`);
      openssl(['x509', '-req', '-in', path.join(base, 'tls.csr'), '-CA', path.join(staging, 'ca-cert.pem'), '-CAkey', path.join(staging, 'ca-key.pem'), '-CAcreateserial', '-days', '90', '-extfile', path.join(base, 'extensions.cnf'), '-out', path.join(base, 'tls-cert.pem')], opensslConfig);
      await chmod(path.join(base, 'tls-key.pem'), 0o444);
      await rm(path.join(base, 'tls.csr'));
      await rm(path.join(base, 'extensions.cnf'));
      await writeFile(path.join(base, 'security.json'), JSON.stringify({ version: 1,
        publicOrigin: `https://${i.key}.localhost:${i.webPort + 1000}`,
        tlsKeyFile: '/run/secrets/tls_key', tlsCertFile: '/run/secrets/tls_cert', identityKeyFile: '/run/secrets/identity_key',
        trustedMasters: i.role === 'worker' && trust ? [{ ...trust, caCertificate: undefined, caFile: '/etc/steward/master-ca.pem' }] : []
      }, null, 2) + '\n');
      await writeFile(path.join(base, 'nginx.conf'), nginx(i.key));
      const ownsBuild = manifest.instances.find(c => c.role === i.role)?.key === i.key;
      const build = (kind: string) => ownsBuild ? `\n    build:\n      context: ${quote(sourceRoot)}\n      dockerfile: infra/Dockerfile.${kind}\n      args: { APP: ${i.role} }` : '';
      services.push(`  ${i.key}-api:
    image: steward-${i.role}-api:0.4.0${build('api')}
    environment:
      STEWARD_ROLE: ${i.role}
      STEWARD_SECURITY_FILE: /etc/steward/security.json
    volumes:
      - type: bind
        source: ${quote(path.join(finalBase, 'security.json'))}
        target: /etc/steward/security.json
        read_only: true${i.role === 'worker' && trust ? `
      - type: bind
        source: ${quote(path.join(target, 'master-ca.pem'))}
        target: /etc/steward/master-ca.pem
        read_only: true` : ''}
    secrets:
      - { source: ${i.key}-tls-key, target: tls_key }
      - { source: ${i.key}-tls-cert, target: tls_cert }
      - { source: ${i.key}-identity-key, target: identity_key }
    networks:
      enrollment:
        aliases: [${i.key}-api]
  ${i.key}-web:
    image: steward-${i.role}-web:0.4.0${build('web')}
    ports: ["127.0.0.1:${i.webPort + 1000}:8443"]
    volumes:
      - type: bind
        source: ${quote(path.join(finalBase, 'nginx.conf'))}
        target: /etc/nginx/conf.d/security.conf
        read_only: true
    secrets:
      - { source: ${i.key}-tls-key, target: tls_key }
      - { source: ${i.key}-tls-cert, target: tls_cert }
      - { source: security-ca, target: trust_ca }`);
      for (const [name, file] of [['tls-key', 'tls-key.pem'], ['tls-cert', 'tls-cert.pem'], ['identity-key', 'identity-key.pem']]) secrets.push(`  ${i.key}-${name}:\n    file: ${quote(path.join(finalBase, file!))}`);
    }
    await writeFile(path.join(staging, 'compose.yaml'), `# Additive Phase 2 overlay. Phase 1 deployment and volumes are preserved.\nservices:\n${services.join('\n')}\nnetworks:\n  enrollment: {}\nsecrets:\n${secrets.join('\n')}\n`);
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify({ version: 1, release: '0.4.0', deploymentHash }, null, 2) + '\n');
    await rename(staging, target);
    staging = undefined;
    return true;
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await rmdir(lock);
  }
}
