import {attachMissionWorkforce} from './mission.js';
import { ensure, find, save, records, publicRecord, object, text, quantity, choice, type Definition, type Context, type RecordValue, type Data } from '@steward/business-kit';
import type { ModulePackageManifest } from '@steward/module-sdk';
const codes = { type: 'array', maxItems: 30, uniqueItems: true, items: text(60) };
const positive = { type: 'integer', minimum: 0, maximum: 100000 };
const syntheticRef = { type: 'string', pattern: '^SYN-[A-Z0-9-]{1,50}$' };
async function knownSkills(values: string[], ctx: Context) { for (const value of values)
    ensure(await find(ctx, 'skill', value), 'Unknown skill: ' + value); }
const count = (n: number, ctx: Context) => n >= ctx.config.minimumGroupSize ? n : null;
async function publish(ctx: Context, r: RecordValue, table: string, data: Data) { await ctx.db.query(`INSERT INTO ${table}(id,revision,projection) VALUES($1,1,$2) ON CONFLICT(id) DO UPDATE SET revision=${table}.revision+1,projection=excluded.projection`, [r.id, { ...data, approved: true }]); }
async function withdraw(ctx: Context, r: RecordValue, table: string) { await ctx.db.query(`UPDATE ${table} SET revision=revision+1,projection=jsonb_set(projection,'{approved}','false') WHERE id=$1 AND projection->>'approved'='true'`, [r.id]); }
async function skillMetrics(ctx: Context, skill: string) {
    const people = await records(ctx, 'person'), achievements = await records(ctx, 'achievement'), programs = await records(ctx, 'program');
    const programCodes = programs.filter(p => p.data.skillCode === skill).map(p => p.key);
    const qualified = people.filter(p => p.data.skills.includes(skill) && p.data.availabilityUnits > 0).length;
    const completed = new Set(achievements.filter(a => programCodes.includes(a.data.programCode)).map(a => a.data.personRef)).size;
    return { skillCode: skill, availablePeople: count(qualified, ctx), completions: count(completed, ctx), suppressed: qualified < ctx.config.minimumGroupSize || completed < ctx.config.minimumGroupSize, minimumGroupSize: ctx.config.minimumGroupSize, synthetic: true };
}
export function workforce(manifest: ModulePackageManifest): Definition {
    const legacy:Definition={ manifest, resources: [
            { kind: 'skill', path: '/skills', key: 'code', schema: object({ code: text(60), name: text(), classification: text(80) }) },
            { kind: 'person', path: '/people', key: 'reference', schema: object({ reference: syntheticRef, displayName: { type: 'string', pattern: '^Synthetic [A-Za-z0-9 -]{1,100}$' }, skills: codes, availabilityUnits: positive }), prepare: async (b, p, ctx) => { ensure(ctx.config.syntheticOnly === true, 'Only synthetic Workforce data is supported', 403); await knownSkills(b.skills, ctx); return { ...b, synthetic: true }; } },
            { kind: 'program', path: '/programs', key: 'code', schema: object({ code: text(60), name: text(), skillCode: text(60), seats: quantity, site: text(), startsAt: text(40), endsAt: text(40) }), prepare: async (b, p, ctx) => {
                    await knownSkills([b.skillCode], ctx);
                    ensure(Number.isFinite(Date.parse(b.startsAt)) && Date.parse(b.startsAt) < Date.parse(b.endsAt), 'Invalid training interval');
                    const active = (await records(ctx, 'enrollment')).filter(e => e.data.programCode === b.code).length;
                    ensure(b.seats >= active, 'Program capacity cannot be below active enrollments');
                    return { ...b, startsAt:new Date(b.startsAt).toISOString(),endsAt:new Date(b.endsAt).toISOString(),status: 'unpublished' };
                }, after: async (r, p, ctx) => { if (p)
                    await withdraw(ctx, r, 'training_metrics'); } },
            { kind: 'enrollment', path: '/enrollments', key: 'number', schema: object({ number: text(80), personRef: syntheticRef, programCode: text(60) }), prepare: async (b, p, ctx) => {
                    ensure(!p, 'Enrollment records are immutable');
                    ensure(await find(ctx, 'person', b.personRef), 'Unknown synthetic person');
                    const program = await find(ctx, 'program', b.programCode);
                    ensure(program, 'Unknown training program');
                    const active = (await records(ctx, 'enrollment')).filter(e => e.data.programCode === b.programCode);
                    ensure(active.length < program.data.seats, 'Training program capacity reached', 409);
                    ensure(!(await records(ctx, 'enrollment')).some(e => e.data.personRef === b.personRef && e.data.programCode === b.programCode), 'Duplicate program enrollment', 409);
                    return { ...b, status: 'enrolled', synthetic: true };
                } },
            { kind: 'achievement', path: '/achievements', key: 'number', schema: object({ number: text(80), personRef: syntheticRef, programCode: text(60) }), prepare: async () => { ensure(false, 'Achievements are created only by authorized completion of a training enrollment'); return {}; } },
            { kind: 'position', path: '/positions', key: 'code', schema: object({ code: text(60), title: text(), requiredSkills: codes, openings: quantity, site: text(), status: choice(['open', 'closed']) }), prepare: async (b, p, ctx) => { await knownSkills(b.requiredSkills, ctx); ensure(b.requiredSkills.length > 0, 'At least one required skill is required'); return b; }, after: async (r, p, ctx) => { if (p)
                    await withdraw(ctx, r, 'workforce_demand'); } }
        ], actions: [
            ...[{ kind: 'skill', path: '/withdraw-skills/:id', table: 'workforce_supply' }, { kind: 'program', path: '/withdraw-program/:id', table: 'training_metrics' }, { kind: 'position', path: '/withdraw-position/:id', table: 'workforce_demand' }].map(t => ({ path: t.path, permission: 'cee.workforce.publish', kind: t.kind, run: async (r: RecordValue, ctx: Context) => { await withdraw(ctx, r, t.table); return { record: publicRecord(r) }; } })),
            { path: '/complete/:id', permission: 'cee.workforce.people.complete', kind: 'enrollment', run: async (r, ctx) => {
                    ensure(r.data.status === 'enrolled', 'Training enrollment is not active');
                    const person = (await find(ctx, 'person', r.data.personRef))!, program = (await find(ctx, 'program', r.data.programCode))!;
                    await save(ctx, 'achievement', 'completion-' + r.key, { number: 'completion-' + r.key, personRef: person.key, programCode: program.key, completedAt: new Date().toISOString(), synthetic: true });
                    await save(ctx, 'person', person.key, { ...person.data, skills: [...new Set([...person.data.skills, program.data.skillCode])] }, person);
                    return { record: publicRecord(await save(ctx, 'enrollment', r.key, { ...r.data, status: 'completed', completedAt: new Date().toISOString() }, r)) };
                } },
            { path: '/publish-skills/:id', permission: 'cee.workforce.publish', kind: 'skill', run: async (r, ctx) => { const metrics = await skillMetrics(ctx, r.key); await publish(ctx, r, 'workforce_supply', metrics); return { record: publicRecord(r), aggregate: metrics }; } },
            { path: '/publish-program/:id', permission: 'cee.workforce.publish', kind: 'program', run: async (r, ctx) => {
                    const active = (await records(ctx, 'enrollment')).filter(e => e.data.programCode === r.key).length, completed = (await records(ctx, 'achievement')).filter(e => e.data.programCode === r.key).length;
                    await publish(ctx, r, 'training_metrics', { programCode: r.key, name: r.data.name, skillCode: r.data.skillCode, site: r.data.site, seats: r.data.seats, remainingSeats: Date.parse(r.data.endsAt)<=Date.now()?0:r.data.seats-active, completed: count(completed, ctx), startsAt: r.data.startsAt, endsAt: r.data.endsAt, synthetic: true, minimumGroupSize: ctx.config.minimumGroupSize });
                    return { record: publicRecord(await save(ctx, 'program', r.key, { ...r.data, status: 'published' }, r)) };
                } },
            { path: '/publish-position/:id', permission: 'cee.workforce.publish', kind: 'position', run: async (r, ctx) => { await publish(ctx, r, 'workforce_demand', { positionCode: r.key, title: r.data.title, requiredSkills: r.data.requiredSkills, openings: r.data.status === 'open' ? r.data.openings : 0, site: r.data.site, synthetic: true }); return { record: publicRecord(r) }; } }
        ], queries: [{ path: '/matches', run: async (ctx) => {
                    ensure(ctx.permissions.includes('cee.workforce.people.read'), 'Individual matching permission required', 403);
                    const positions = (await records(ctx, 'position')).filter(p => p.data.status === 'open'), people = await records(ctx, 'person');
                    return { records: positions.flatMap(p => people.filter(c => c.data.availabilityUnits > 0 && p.data.requiredSkills.every((s: string) => c.data.skills.includes(s))).map(c => ({ id: p.id + ':' + c.id, positionCode: p.key, candidateReference: c.key, requiredSkills: p.data.requiredSkills, decision: 'Human review required; no employment decision was executed' }))).slice(0, 20), summary: 'Synthetic local candidate matching. Private person records are never contributed to ecosystem MCP or synchronization.' };
                } }], report: async (ctx) => {
            const skills = await records(ctx, 'skill'), programs = await records(ctx, 'program'), positions = (await records(ctx, 'position')).filter(p => p.data.status === 'open');
            const metrics = [];
            for (const skill of skills)
                metrics.push(await skillMetrics(ctx, skill.key));
            const enrolled=new Map<string,number>();for(const e of await records(ctx,'enrollment'))enrolled.set(e.data.programCode,(enrolled.get(e.data.programCode)??0)+1);
            const available=(p:RecordValue)=>Date.parse(p.data.endsAt)<=Date.now()?0:Math.max(0,p.data.seats-(enrolled.get(p.key)??0));
            return { records: metrics.slice(0,20).map(m => ({ ...m, id: m.skillCode })),skillMetricCount:metrics.length,trainingTotalSeats:programs.reduce((n,p)=>n+p.data.seats,0),availableTrainingSeats:programs.reduce((n,p)=>n+available(p),0),trainingCapacity:programs.slice(0,20).map(p=>({programCode:p.key,totalSeats:p.data.seats,availableSeats:available(p),endsAt:p.data.endsAt})),programCount:programs.length,openPositions: positions.reduce((n, p) => n + p.data.openings, 0), summary: 'Synthetic aggregates only; first 20 skill/program details, with total counts. Suppressed groups are unknown, never zero. Available seats exclude completed cohort enrollments and ended programs.' };
        } };return attachMissionWorkforce(legacy);
}
