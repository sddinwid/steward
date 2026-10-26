import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {resourceCoordination} from './definition.js';
await startBusinessModule(resourceCoordination(JSON.parse(await readFile('./manifest.json','utf8'))));
