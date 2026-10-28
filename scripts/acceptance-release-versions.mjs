import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateReleaseVersions} from './release-contracts.mjs';
// Explicit selection lets earlier-phase regression runners verify compatible new
// packages. Default remains the preserved Phase13 map; original obligations never move.
const version=process.env.STEWARD_ACCEPTANCE_RELEASE??'0.13.0';
assert(['0.13.0','0.14.0','0.15.0','0.16.0'].includes(version),'Select a supported acceptance release');
export const acceptanceReleaseVersions=validateReleaseVersions(JSON.parse(await readFile(new URL('../docs/phase'+version.split('.')[1]+'-module-versions.json',import.meta.url),'utf8')),version);
export function acceptanceModuleVersion(moduleId){assert(Object.hasOwn(acceptanceReleaseVersions.modules,moduleId),'Module is not selected by this acceptance release');return acceptanceReleaseVersions.modules[moduleId];}
