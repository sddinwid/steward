import { digest } from '@steward/module-sdk';

// Docker accepts long container names, but its DNS names must fit one label.
// Preserve existing names whenever possible, including all earlier releases.
export function moduleContainerName(project: string, worker: string, moduleId: string) {
  const suffix = `${worker}-m_${digest(moduleId).slice(0, 20)}`;
  const original = `${project}-${suffix}`;
  return original.length <= 63 ? original : `${project.slice(0, 63 - suffix.length - 14)}-${digest(project).slice(0, 12)}-${suffix}`;
}
