import { canonical, digest, type ModulePackageManifest } from './index.js';
export const INTEGRATION_PROTOCOL = 'steward-module-integration-v1' as const;
export interface IntegrationPeer {
    moduleId: string;
    minimumVersion: string;
    sends: {
        command: string;
        version: 1;
    }[];
    receives: {
        command: string;
        version: 1;
    }[];
}
export interface IntegrationContract {
    version: 1;
    outboxPath: string;
    acknowledgmentPath: string;
    inboxPath: string;
    peers: IntegrationPeer[];
}
export interface IntegrationCommand {
    protocol: typeof INTEGRATION_PROTOCOL;
    commandId: string;
    sourceModuleId: string;
    targetModuleId: string;
    command: string;
    version: 1;
    aggregateId: string;
    sequence: number;
    occurredAt: string;
    payload: Record<string, unknown>;
}
const id = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys = (v: object, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
export function validateIntegration(m: ModulePackageManifest) {
    const c = m.integration;
    if (!c)
        return;
    if (!keys(c, ['version', 'outboxPath', 'acknowledgmentPath', 'inboxPath', 'peers']) || c.version !== 1 || ![c.outboxPath, c.acknowledgmentPath, c.inboxPath].every(p => /^\/integration-[a-z-]{1,40}$/.test(p)) || new Set([c.outboxPath, c.acknowledgmentPath, c.inboxPath]).size !== 3 || !Array.isArray(c.peers) || c.peers.length > 12 || new Set(c.peers.map(p => p.moduleId)).size !== c.peers.length)
        throw new Error('Invalid integration contract');
    for (const p of c.peers) {
        if (!keys(p, ['moduleId', 'minimumVersion', 'sends', 'receives']) || !id.test(p.moduleId) || p.moduleId === m.moduleId || !/^\d+\.\d+\.\d+$/.test(p.minimumVersion))
            throw new Error('Invalid optional peer');
        for (const list of [p.sends, p.receives])
            if (!Array.isArray(list) || list.length > 12 || new Set(list.map(v => v.command)).size !== list.length || list.some(v => !keys(v, ['command', 'version']) || !id.test(v.command) || v.command.length > 80 || v.version !== 1))
                throw new Error('Invalid integration command declaration');
    }
    // Private integration endpoints can never be reached by the ordinary gateway/MCP.
    if (m.api.some(a => [c.outboxPath, c.acknowledgmentPath, c.inboxPath].includes(a.path)))
        throw new Error('Integration endpoints must not be public APIs');
}
export function validateCommand(c: IntegrationCommand) {
    if (!c || !keys(c, ['protocol', 'commandId', 'sourceModuleId', 'targetModuleId', 'command', 'version', 'aggregateId', 'sequence', 'occurredAt', 'payload']) || c.protocol !== INTEGRATION_PROTOCOL || !uuid.test(c.commandId) || !id.test(c.sourceModuleId) || !id.test(c.targetModuleId) || !id.test(c.command) || c.version !== 1 || !uuid.test(c.aggregateId) || !Number.isSafeInteger(c.sequence) || c.sequence < 1 || !Number.isFinite(Date.parse(c.occurredAt)) || !c.payload || Array.isArray(c.payload) || typeof c.payload !== 'object' || Buffer.byteLength(canonical(c)) > 32768)
        throw new Error('Invalid integration envelope');
    return digest(canonical(c));
}
export function authorizeCommand(c: IntegrationCommand, source: ModulePackageManifest, target: ModulePackageManifest, enabled: {
    source: boolean;
    target: boolean;
}) {
    validateCommand(c);
    validateIntegration(source);
    validateIntegration(target);
    if (!enabled.source || !enabled.target)
        throw new Error('INTEGRATION_DISABLED');
    if (c.sourceModuleId !== source.moduleId || c.targetModuleId !== target.moduleId)
        throw new Error('INTEGRATION_IDENTITY_MISMATCH');
    const outbound = source.integration?.peers.find(p => p.moduleId === target.moduleId), inbound = target.integration?.peers.find(p => p.moduleId === source.moduleId);
    const compatible = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++)
        if (x[i] !== y[i])
            return x[i]! > y[i]!; return true; };
    if (!outbound || !inbound || !compatible(target.version, outbound.minimumVersion) || !compatible(source.version, inbound.minimumVersion) || !outbound.sends.some(v => v.command === c.command && v.version === c.version) || !inbound.receives.some(v => v.command === c.command && v.version === c.version))
        throw new Error('INTEGRATION_NOT_AUTHORIZED');
}
export const integrationSql = `
CREATE TABLE IF NOT EXISTS integration_outbox(command_id uuid PRIMARY KEY,envelope jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','rejected')),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error text,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE INDEX IF NOT EXISTS integration_outbox_due ON integration_outbox(next_attempt_at,created_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS integration_inbox(source_module text NOT NULL,command_id uuid NOT NULL,digest text NOT NULL,response jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_module,command_id));
CREATE TABLE IF NOT EXISTS integration_sequences(source_module text NOT NULL,aggregate_id uuid NOT NULL,sequence bigint NOT NULL,PRIMARY KEY(source_module,aggregate_id));`;
