#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { provisionSecurity } from './security.js';
try {
  const directory = process.argv[2] ?? '.steward/dev';
  const created = await provisionSecurity(directory, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), process.argv[3]);
  console.log(`${created ? 'Created' : 'Preserved'} Phase 2 security overlay. No accounts created and no enrollment performed.`);
} catch { console.error('Security provisioning failed. Check the deployment, OpenSSL availability, trust bundle, and existing security state. Existing installations were preserved.'); process.exitCode = 1; }
