import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {marketing,marketingBackground} from './definition.js';
await startBusinessModule(marketing(JSON.parse(await readFile('./manifest.json','utf8'))),marketingBackground);
