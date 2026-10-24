import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {printify,printifyBackground} from './definition.js';
await startBusinessModule(printify(JSON.parse(await readFile('./manifest.json','utf8'))),printifyBackground);
