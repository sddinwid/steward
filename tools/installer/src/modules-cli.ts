#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { provisionModules } from './modules.js';
try {
  const created = await provisionModules(process.argv[2] ?? '.steward/dev', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
  console.log(`${created ? 'Created' : 'Preserved'} generic module runtime. No module was installed.`);
} catch { console.error('Module runtime provisioning failed; check the base/security deployment and existing module runtime files.'); process.exitCode = 1; }
