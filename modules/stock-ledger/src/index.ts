import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {stockLedger} from './definition.js';
await startBusinessModule(stockLedger(JSON.parse(await readFile('./manifest.json','utf8'))));
