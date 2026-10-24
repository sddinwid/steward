import {readFile} from 'node:fs/promises';
import {startBusinessModule} from '@steward/business-kit';
import {shopify,shopifyBackground} from './definition.js';
await startBusinessModule(shopify(JSON.parse(await readFile('./manifest.json','utf8'))),shopifyBackground);
