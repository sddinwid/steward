import {createProgrammeAdministration,createMissionFinance} from '@steward/mission-kit';
export const moduleId='steward.housing.services';
export const ownerPermissions=['program.read','program.manage','program.all-cases','program.report','program.publish','program.finance','program.fund','case.read','case.write','case.review','case.refer','case.close'];
export const administration=createProgrammeAdministration({moduleId,upgradableOwnerPermissions:['program.finance','program.fund'],ownerPermissions,roles:{coordinator:ownerPermissions,caseworker:['program.read','case.read','case.write','case.refer'],reviewer:['program.read','case.read','case.review','case.refer','case.close'],reporter:['program.read','program.report']},includeCaseAssignments:true});

export const finance=createMissionFinance(moduleId);
