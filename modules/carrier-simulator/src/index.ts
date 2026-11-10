import { readFile } from 'node:fs/promises';
import { startBusinessModule } from '@steward/business-kit';
import { carrierSimulator, carrierBackground } from './definition.js';
await startBusinessModule(carrierSimulator(JSON.parse(await readFile('./manifest.json', 'utf8'))), carrierBackground);
