import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {workforce} from './definition.js';
await startBusinessModule(workforce(JSON.parse(await readFile('./manifest.json','utf8'))));
