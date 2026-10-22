#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { PostgresDatabase } from '../database.js';
import { createAccount } from './auth.js';
let database: PostgresDatabase | undefined;
try {
  const { values } = parseArgs({ options: { username: { type: 'string' }, role: { type: 'string' }, 'password-stdin': { type: 'boolean' } } });
  if (!values.username || !values.role || !values['password-stdin']) throw new Error('Use --username NAME --role registry_admin|enrollment_admin|viewer|local_admin --password-stdin');
  const role = process.env.STEWARD_ROLE;
  if (role !== 'master' && role !== 'worker') throw new Error('STEWARD_ROLE must be configured');
  if ((role === 'worker') !== ['local_admin', 'module_user'].includes(values.role)) throw new Error('Account role does not match this installation');
  let password = '';
  for await (const chunk of process.stdin) { password += chunk.toString(); if (password.length > 512) throw new Error('Password input too large'); }
  password = password.replace(/[\r\n]+$/, '');
  const config = await loadConfig(role);
  database = new PostgresDatabase(config.database, config.installation);
  await database.migrate();
  const id = await createAccount(database.pool, values.username, password, values.role);
  console.log(`Created account ${values.username} (${id}). No credentials were logged.`);
} catch { console.error('Account creation failed: verify arguments, uniqueness, password length, and database availability.'); process.exitCode = 1; }
finally { await database?.close(); }
