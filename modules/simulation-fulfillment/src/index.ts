import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {simulationFulfillment,simulationFulfillmentBackground} from './definition.js';
await startBusinessModule(simulationFulfillment(JSON.parse(await readFile('./manifest.json','utf8'))),simulationFulfillmentBackground);
