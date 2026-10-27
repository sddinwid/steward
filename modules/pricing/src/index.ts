import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {pricing} from './definition.js';
await startBusinessModule(pricing(JSON.parse(await readFile('./manifest.json','utf8'))));
