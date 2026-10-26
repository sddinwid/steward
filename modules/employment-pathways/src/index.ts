import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {employmentPathways} from './definition.js';
await startBusinessModule(employmentPathways(JSON.parse(await readFile('./manifest.json','utf8'))));
