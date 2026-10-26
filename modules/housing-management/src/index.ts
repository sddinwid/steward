import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {housingManagement} from './definition.js';
await startBusinessModule(housingManagement(JSON.parse(await readFile('./manifest.json','utf8'))));
