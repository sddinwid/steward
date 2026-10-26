import {createProgrammeAdministration,createMissionFinance} from '@steward/mission-kit';
import {randomUUID} from 'node:crypto';
import type {Data} from '@steward/business-kit';
import {uuid} from './contracts.js';
export const moduleId='steward.employment.pathways';
export const ownerPermissions=['program.read','program.manage','program.all-cases','case.read','case.write','pathway.read','pathway.write','pathway.review','pathway.place','program.report','program.publish','program.finance','program.fund'];
const fields=Object.fromEntries(['training','employment'].flatMap(prefix=>[['ProgramId',uuid],['EntityId',uuid],['InstallationId',uuid],['ModuleId',{type:'string',pattern:'^[a-z][a-z0-9.-]{1,79}$'}]].map(([suffix,schema])=>[prefix+'Authority'+suffix,schema])));
export const administration=createProgrammeAdministration({moduleId,upgradableOwnerPermissions:['program.finance','program.fund'],ownerPermissions,roles:{coordinator:ownerPermissions,caseWorker:['program.read','case.read','case.write','pathway.read','pathway.write','pathway.review'],placementOfficer:['program.read','case.read','pathway.read','pathway.place'],reporter:['program.read','program.report']},includeCaseAssignments:true,participantField:'participantAlias',programFields:fields as Record<string,Data>,programRequired:Object.keys(fields),programPrepare:async(b,p)=>({...b,trainingCatalogueId:p?.data.trainingCatalogueId??randomUUID(),employmentCatalogueId:p?.data.employmentCatalogueId??randomUUID()})});

export const finance=createMissionFinance(moduleId);
