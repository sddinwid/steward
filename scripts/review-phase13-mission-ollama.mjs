// Requires separate operator review of the actual narrative and full source
// evidence. The existing reviewer performs real browser publication and ACKs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
process.env.STEWARD_OLLAMA_REVIEW_REPORT='artifacts/phase13-mission-ollama.json';
const report=JSON.parse(await readFile(process.env.STEWARD_OLLAMA_REVIEW_REPORT,'utf8'));
assert.equal(report.capability,'mission-sustainability');
assert(report.missionCalculation?.calculationId,'Actual retained mission evidence is required');
assert.equal(process.env.STEWARD_REVIEWED_INVESTIGATION_ID,report.investigationId,'Identify the independently reviewed real-model investigation');
await import('./review-phase12-ollama.mjs');
