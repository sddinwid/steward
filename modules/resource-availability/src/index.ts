import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {resourceAvailability} from './definition.js';
await startBusinessModule(resourceAvailability(JSON.parse(await readFile('./manifest.json','utf8'))));
