import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePhase13Versions} from './release-contracts.mjs';

// Resolve within the copied release toolkit, independently of operator CWD or
// deployment directory. Frozen grants/obligations retain their historical pins.
export const phase13ReleaseVersions=validatePhase13Versions(JSON.parse(await readFile(new URL('../docs/phase13-module-versions.json',import.meta.url),'utf8')));
export function phase13ModuleVersion(moduleId){
 assert(Object.hasOwn(phase13ReleaseVersions.modules,moduleId),'Module is not selected by this Phase 13 release');
 return phase13ReleaseVersions.modules[moduleId];
}
