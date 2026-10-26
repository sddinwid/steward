// Use the existing bounded TLS local Ollama verifier, with its configuration
// recovery journal, real tool-call capture, provider restoration and unload.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
if(!process.argv[2]){const selection=JSON.parse(await readFile('.steward/operator/selection.json','utf8'));process.argv[2]=selection.directory;}
const {directory}=await import('./lib.mjs');
const state=JSON.parse(await readFile(path.join(directory,'demo/phase13-mission.json'),'utf8'));
assert(state.scenarioId,'Run successful actual G/H source/scenario acceptance before genuine model validation');
process.env.STEWARD_ANALYST_CAPABILITY='mission-sustainability';
process.env.STEWARD_OLLAMA_MODEL??='qwen2.5:7b';
process.env.STEWARD_OLLAMA_CONTEXT??='16384';
process.env.STEWARD_OLLAMA_BROWSER??='1';
process.env.STEWARD_OLLAMA_REPORT??='artifacts/phase13-mission-ollama.json';
process.env.STEWARD_VERIFY_PROVIDER_STATUS='1';
process.env.STEWARD_OLLAMA_DEFER_PUBLICATION='1';
// Publication is a separate human review; the G/H acceptance browser publishes
// and acknowledges an evidence-identical deterministic finding independently.
delete process.env.STEWARD_OLLAMA_PUBLISH_REVIEWED;
process.env.STEWARD_ANALYST_PROMPT='Investigate the reviewed synthetic mission sustainability scenario '+state.scenarioId+'. Discover authorized programme aggregates and then reviewed scenarios using live MCP tools. Invoke analyze_mission_sustainability with this exact existing scenario ID. Do not invent programme assumptions or access participant cases. Explain only retrieved evidence and deterministic scientific results. Copy all displayAmounts exactly into your narrative. Distinguish source-approved available funding, actual observed cost, period funding gap, hypothetical incremental unit cost/capacity, and the calculated conditional additional units. Keep unknown elapsed retention unknown, do not sum people across modules, and list human decisions. Do not publish a finding or execute services.';
await import('./verify-ollama-provider.mjs');
