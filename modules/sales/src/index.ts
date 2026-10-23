import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {sales} from './definition.js';
await startBusinessModule(sales(JSON.parse(await readFile('./manifest.json','utf8'))));
