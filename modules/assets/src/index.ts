import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {assets} from './definition.js';
await startBusinessModule(assets(JSON.parse(await readFile('./manifest.json','utf8'))));
