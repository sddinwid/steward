import {z} from 'zod';
import {SIMULATION_SCENARIOS} from '@steward/module-sdk';
export const simulationOriginSchema=z.object({version:z.literal(1),datasetId:z.string().uuid(),runId:z.string().uuid(),ecosystemId:z.string().uuid(),seed:z.number().int().min(0).max(0xffffffff),eventIndex:z.number().int().min(0).max(1e6),scenario:z.enum(SIMULATION_SCENARIOS),simulatedAt:z.string().datetime(),speed:z.number().int().min(1).max(600)}).strict();
