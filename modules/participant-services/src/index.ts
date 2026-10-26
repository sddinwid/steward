import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {participantServices} from './definition.js';
await startBusinessModule(participantServices(JSON.parse(await readFile('./manifest.json','utf8'))));
