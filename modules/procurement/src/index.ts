import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {procurement} from './definition.js';
await startBusinessModule(procurement(JSON.parse(await readFile('./manifest.json','utf8'))));
