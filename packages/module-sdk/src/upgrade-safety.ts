/** Unknown module-owned authority is never evidence of a safe replacement. */
export const moduleUpgradeBlockedMessage = 'Module upgrade blocked: package-bound authority requires a verified continuity plan. Ordinary replacement cannot certify monitoring, reservations, pending work or publication approvals. Use the separately reviewed execution workflow only when an exact publisher-signed transition is available. No identity override is permitted.';
export function assertNoModuleIdentityReplacement(previous: string | undefined, candidate: string): void {
  if (previous !== undefined && previous !== candidate) throw Object.assign(new Error(moduleUpgradeBlockedMessage), {code: 'MODULE_UPGRADE_CONTINUITY_REQUIRED'});
}

export interface RetainedModulePackage {phase?: string; descriptorDigest?: string; version?: string; imageId?: string}
export function assertRetainedModulePackage(previous: RetainedModulePackage | undefined, candidate: {digest: string; version: string; imageId: string}): void {
  if (!previous) return;
  if (previous.descriptorDigest !== undefined) return assertNoModuleIdentityReplacement(previous.descriptorDigest,candidate.digest);
  if (previous.phase === 'preparing' && previous.version === undefined && previous.imageId === undefined) return;
  if (previous.version !== candidate.version || previous.imageId !== candidate.imageId) throw Object.assign(new Error(moduleUpgradeBlockedMessage), {code: 'MODULE_UPGRADE_CONTINUITY_REQUIRED'});
}
