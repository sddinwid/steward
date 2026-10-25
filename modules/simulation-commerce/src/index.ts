import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {simulationCommerce,simulationCommerceBackground} from './definition.js';
await startBusinessModule(simulationCommerce(JSON.parse(await readFile('./manifest.json','utf8'))),simulationCommerceBackground);
