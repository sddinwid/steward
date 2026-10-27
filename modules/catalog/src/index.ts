import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {catalog} from './definition.js';
await startBusinessModule(catalog(JSON.parse(await readFile('./manifest.json','utf8'))));
