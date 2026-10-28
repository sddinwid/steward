// These checks never start a model, browser, Docker command, login or deployment.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
for(const script of ['verify-phase15-installed-catalog-ollama.mjs','inspect-phase15-installed-catalog-analyst.mjs','verify-phase15-clean-installation.mjs','verify-phase15-live-catalog.mjs'])test(script+' refuses execution before operator readiness without Git, Docker or private installation files',()=>{const file=fileURLToPath(new URL(script,import.meta.url));assert.throws(()=>execFileSync(process.execPath,[file],{cwd:tmpdir(),env:{PATH:''},encoding:'utf8',stdio:['ignore','pipe','pipe']}),error=>error.status!==0&&/readiness required/i.test(error.stderr));});
