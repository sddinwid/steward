// Requires separate operator review of the actual narrative and full source
// evidence. The existing reviewer performs real browser publication and ACKs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
if(!process.argv[2]){const selection=JSON.parse(await readFile('.steward/operator/selection.json','utf8'));assert(selection.directory,'Selected operator deployment required');process.argv[2]=selection.directory;}
assert(process.env.STEWARD_SEED_CREDENTIALS_FILE,'Explicitly select the same credential file used for the named Master scenario/disclosure account; never substitute presenter credentials');
process.env.STEWARD_OLLAMA_REVIEW_REPORT??=process.env.STEWARD_OLLAMA_MISSION_COMPARE==='1'?'artifacts/phase13-mission-ollama-comparison.json':'artifacts/phase13-mission-ollama.json';
const report=JSON.parse(await readFile(process.env.STEWARD_OLLAMA_REVIEW_REPORT,'utf8'));
assert.equal(report.capability,'mission-sustainability');
assert(report.missionCalculation?.calculationId,'Actual retained mission evidence is required');
assert.equal(process.env.STEWARD_REVIEWED_INVESTIGATION_ID,report.investigationId,'Identify the independently reviewed real-model investigation');
await import('./review-phase12-ollama.mjs');
