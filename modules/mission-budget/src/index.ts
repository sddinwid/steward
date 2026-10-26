import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {missionBudget} from './definition.js';
await startBusinessModule(missionBudget(JSON.parse(await readFile('./manifest.json','utf8'))));
