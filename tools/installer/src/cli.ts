#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { provision } from './provision.js';
import {PLATFORM_RELEASE} from '@steward/contracts';

try {
  const { values, positionals } = parseArgs({ options: {
    directory: { type: 'string', default: '.steward/dev' },
    mode: { type: 'string', default: 'all' }, workers: { type: 'string', default: '3' },
    project: { type: 'string', default: 'steward-dev' }, label: { type: 'string', default: 'Local Steward' },
    help: { type: 'boolean', default: false }
    ,'port-offset':{type:'string'}
  }, allowPositionals: true });
  if (values.help) {
    console.log(`Steward provisioner v1 (release ${PLATFORM_RELEASE}; preserves earlier v1 deployments)\nUsage: steward-install provision [--directory PATH] [--mode all|master|worker] [--workers 1..20] [--project NAME] [--label TEXT]\nCreates a deployment; reruns preserve all existing state. Does not enroll installations.`);
  } else {
    if (positionals.length !== 1 || positionals[0] !== 'provision') throw new Error('Expected provision command. Use --help.');
    const result = await provision({ directory: values.directory!, sourceRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
      mode: values.mode as 'all' | 'master' | 'worker', workers: Number(values.workers), project: values.project!, label: values.label!,...(values['port-offset']!==undefined?{portOffset:Number(values['port-offset'])}:{}) });
    console.log(`${result.created ? 'Created' : 'Preserved'} provisioner v1 deployment: ${path.resolve(values.directory!)}`);
    console.log(`${result.manifest.instances.length} installation(s); no enrollment performed.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Provisioning failed');
  process.exitCode = 1;
}
