import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {foodServices} from './definition.js';
await startBusinessModule(foodServices(JSON.parse(await readFile('./manifest.json','utf8'))));
