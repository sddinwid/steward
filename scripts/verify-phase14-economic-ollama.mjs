// Existing TLS local provider bridge: actual native model/MCP/science, recovery and unload.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
if(!process.argv[2])process.argv[2]=JSON.parse(await readFile('.steward/operator/selection.json','utf8')).directory;
const {directory}=await import('./lib.mjs');
const state=JSON.parse(await readFile(path.join(directory,'demo/phase14-economy.json'),'utf8'));
assert(state.reviewedPlanning?.scenarioId,'First complete actual reviewed Master scenario creation');
process.env.STEWARD_ANALYST_CAPABILITY='economic-sustainability';
process.env.STEWARD_OLLAMA_MODEL??='qwen2.5:7b';
process.env.STEWARD_OLLAMA_CONTEXT??='16384';
process.env.STEWARD_OLLAMA_TIMEOUT_MS??='120000';
process.env.STEWARD_OLLAMA_BROWSER??='1';
process.env.STEWARD_OLLAMA_REPORT??='artifacts/phase14-economic-ollama.json';
process.env.STEWARD_VERIFY_PROVIDER_STATUS='1';
process.env.STEWARD_OLLAMA_DEFER_PUBLICATION='1';
delete process.env.STEWARD_OLLAMA_PUBLISH_REVIEWED;
process.env.STEWARD_ANALYST_PROMPT='Investigate only reviewed synthetic economic scenario '+state.reviewedPlanning.scenarioId+'. Discover current authorized financial evidence using query_economic_summaries with exactly {"limit":3,"offset":0} (maximum allowed limit is 4; never request 100), find this existing reviewed scenario with query_economic_scenarios, then invoke analyze_economic_sustainability using its exact scenario ID. Explain all four alternatives with exact displayProposedContribution amounts. For every baseline programme copy conditionalUnitPeriods, unit, displayBaseOperatingCost and displayIncrementalServiceCost. All monetary amounts must copy formatted tool evidence. Describe conditional services, never observed outcomes or unique people. Explain restrictions, reserve protection, assumptions and separate contributor/recipient human approvals. Do not invent forecasts, authorize funding, transfer money or publish a finding.';
await import('./verify-ollama-provider.mjs');
