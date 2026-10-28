import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {automation} from './definition.js';
await startBusinessModule(automation(JSON.parse(await readFile('./manifest.json','utf8'))));
