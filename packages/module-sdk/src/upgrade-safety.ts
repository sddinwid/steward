/** Unknown module-owned authority is never evidence of a safe replacement. */
export const moduleUpgradeBlockedMessage = 'Module upgrade blocked: package-bound authority requires a verified continuity plan. Monitoring, reservations, pending external work and publication approvals cannot be certified safe by current module contracts. Keep the installed package; review upgrade-preflight dependency categories. No continuity override is implemented.';
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
