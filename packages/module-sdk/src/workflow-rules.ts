/** Data-only rules shared by the designer and governed SSMA coordinator.
 * This module neither discovers providers nor grants execution authority. */
export type WorkflowScalar = string | number | boolean | null;
export type WorkflowValueType = 'string' | 'integer' | 'boolean' | 'null';
export interface WorkflowField {
  type: WorkflowValueType;
  sensitivity: 'public' | 'business' | 'restricted';
  maxAgeMs: number;
}
export type WorkflowFields = Readonly<Record<string, WorkflowField>>;
/** Derive selectable scalar fields from one verified, closed capability/event
 * schema. Arrays, unions and open objects are deliberately not guessed. */
export function workflowFieldsFromSchema(namespace: string, schema: unknown,
  policy: Omit<WorkflowField, 'type'>): WorkflowFields {
  requireRule(/^[a-z][a-z0-9_-]{0,47}$/.test(namespace) && !forbidden.has(namespace), 'WORKFLOW_FIELD_INVALID');
  const result: Record<string, WorkflowField> = Object.create(null);
  let count = 0;
  function walk(value: unknown, path: string, depth: number) {
    requireRule(++count <= 128 && depth <= 6, 'WORKFLOW_SCHEMA_LIMIT');
    requireRule(!!value && typeof value === 'object' && !Array.isArray(value), 'WORKFLOW_SCHEMA_INVALID');
    const s = value as Record<string, unknown>;
    requireRule(!Object.keys(s).some(key => ['$ref', '$id', '$async', 'oneOf', 'anyOf', 'allOf', 'if', 'then', 'else'].includes(key)), 'WORKFLOW_SCHEMA_UNSUPPORTED');
    if (s.type === 'object') {
      requireRule(s.additionalProperties === false && !!s.properties && typeof s.properties === 'object' && !Array.isArray(s.properties), 'WORKFLOW_SCHEMA_OPEN');
      for (const [key, child] of Object.entries(s.properties)) {
        requireRule(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) && !forbidden.has(key), 'WORKFLOW_FIELD_INVALID');
        walk(child, path + '.' + key, depth + 1);
      }
    } else {
      requireRule(['string', 'integer', 'boolean', 'null'].includes(String(s.type)), 'WORKFLOW_SCHEMA_UNSUPPORTED');
      result[path] = {type: s.type as WorkflowValueType, ...policy};
      validateWorkflowExpression({field: path}, result);
    }
  }
  requireRule(!!schema && (schema as Record<string, unknown>).type === 'object', 'WORKFLOW_SCHEMA_INVALID');
  walk(schema, namespace, 0);
  return result;
}
export interface WorkflowObservation {
  value: WorkflowScalar;
  observedAt: number;
  source: {
    entityId: string; installationId: string; moduleId: string;
    moduleInstallationId: string; packageDigest: string;
    streamId: string; recordId: string; revision: number;
  };
}
export type WorkflowExpression =
  | { literal: WorkflowScalar }
  | { field: string }
  | { op: 'not'; args: [WorkflowExpression] }
  | { op: 'and' | 'or'; args: WorkflowExpression[] }
  | { op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'add' | 'subtract' | 'multiply' | 'divide'; args: [WorkflowExpression, WorkflowExpression] };

export class WorkflowRuleError extends Error {
  constructor(readonly code: string) { super(code); }
}
function requireRule(condition: unknown, code: string): asserts condition {
  if (!condition) throw new WorkflowRuleError(code);
}
function closed(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => names.includes(key));
}
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const fieldPattern = /^[a-z][a-z0-9_-]{0,47}(?:\.[a-zA-Z][a-zA-Z0-9_-]{0,63}){1,7}$/;
function scalarType(value: unknown): WorkflowValueType {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    requireRule(Number.isSafeInteger(value), 'WORKFLOW_INTEGER_REQUIRED');
    return 'integer';
  }
  if (typeof value === 'string') {
    requireRule(value.length <= 1024, 'WORKFLOW_VALUE_TOO_LARGE');
    return 'string';
  }
  requireRule(typeof value === 'boolean', 'WORKFLOW_SCALAR_REQUIRED');
  return 'boolean';
}

/** Compile only bounded expressions against an already authorized field catalog.
 * Field catalogs must be derived from verified capability/event schemas. */
export function validateWorkflowExpression(expression: unknown, fields: WorkflowFields): WorkflowValueType {
  let count = 0;
  function visit(node: unknown, depth: number): WorkflowValueType {
    requireRule(++count <= 128 && depth <= 12, 'WORKFLOW_EXPRESSION_LIMIT');
    requireRule(closed(node, ['literal', 'field', 'op', 'args']), 'WORKFLOW_EXPRESSION_INVALID');
    if (Object.hasOwn(node, 'literal')) {
      requireRule(Object.keys(node).length === 1, 'WORKFLOW_EXPRESSION_INVALID');
      return scalarType(node.literal);
    }
    if (Object.hasOwn(node, 'field')) {
      requireRule(Object.keys(node).length === 1 && typeof node.field === 'string'
        && fieldPattern.test(node.field) && !node.field.split('.').some(p => forbidden.has(p)), 'WORKFLOW_FIELD_INVALID');
      requireRule(Object.hasOwn(fields, node.field), 'WORKFLOW_FIELD_NOT_DECLARED');
      const field = fields[node.field]!;
      requireRule(['string', 'integer', 'boolean', 'null'].includes(field.type)
        && ['public', 'business', 'restricted'].includes(field.sensitivity)
        && Number.isSafeInteger(field.maxAgeMs) && field.maxAgeMs >= 1 && field.maxAgeMs <= 31 * 86400000,
      'WORKFLOW_FIELD_POLICY_INVALID');
      return field.type;
    }
    requireRule(Object.keys(node).length === 2 && typeof node.op === 'string' && Array.isArray(node.args), 'WORKFLOW_EXPRESSION_INVALID');
    const op = node.op, args = node.args;
    requireRule(op === 'not' ? args.length === 1 : ['and', 'or'].includes(op)
      ? args.length >= 2 && args.length <= 8 : args.length === 2, 'WORKFLOW_ARITY_INVALID');
    const types = args.map(arg => visit(arg, depth + 1));
    if (['and', 'or', 'not'].includes(op)) {
      requireRule(types.every(type => type === 'boolean'), 'WORKFLOW_BOOLEAN_REQUIRED');
      return 'boolean';
    }
    if (['eq', 'ne'].includes(op)) {
      requireRule(types[0] === types[1], 'WORKFLOW_TYPE_MISMATCH');
      return 'boolean';
    }
    requireRule(['lt', 'lte', 'gt', 'gte', 'add', 'subtract', 'multiply', 'divide'].includes(op), 'WORKFLOW_OPERATOR_INVALID');
    requireRule(types.every(type => type === 'integer'), 'WORKFLOW_INTEGER_REQUIRED');
    return ['lt', 'lte', 'gt', 'gte'].includes(op) ? 'boolean' : 'integer';
  }
  return visit(expression, 0);
}

/** Eager evaluation is intentional: a stale/missing operand cannot be hidden by
 * Boolean short-circuiting. Arithmetic is exact safe-integer arithmetic only. */
export function evaluateWorkflowExpression(expression: WorkflowExpression, fields: WorkflowFields,
  observations: Readonly<Record<string, WorkflowObservation>>, scope: { entityId: string; now: number }): WorkflowScalar {
  validateWorkflowExpression(expression, fields);
  requireRule(Number.isSafeInteger(scope.now) && scope.now >= 0, 'WORKFLOW_CLOCK_INVALID');
  function evaluate(node: WorkflowExpression): WorkflowScalar {
    if ('literal' in node) return node.literal;
    if ('field' in node) {
      requireRule(Object.hasOwn(observations, node.field), 'WORKFLOW_VALUE_MISSING');
      const observed = observations[node.field]!, policy = fields[node.field]!;
      requireRule(!!observed && typeof observed === 'object' && !!observed.source, 'WORKFLOW_PROVENANCE_REQUIRED');
      requireRule(observed.source.entityId === scope.entityId, 'WORKFLOW_ENTITY_SCOPE_MISMATCH');
      const s = observed.source;
      requireRule([s.entityId, s.installationId, s.moduleInstallationId, s.recordId].every(id =>
        typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        && typeof s.moduleId === 'string' && /^[a-z][a-z0-9.-]{0,79}$/.test(s.moduleId)
        && typeof s.streamId === 'string' && /^[a-z][a-z0-9.-]{0,79}$/.test(s.streamId)
        && typeof s.packageDigest === 'string' && /^[a-f0-9]{64}$/.test(s.packageDigest)
        && Number.isSafeInteger(s.revision) && s.revision >= 1, 'WORKFLOW_PROVENANCE_INVALID');
      requireRule(Number.isSafeInteger(observed.observedAt) && observed.observedAt >= 0
        && observed.observedAt <= scope.now && scope.now - observed.observedAt <= policy.maxAgeMs, 'WORKFLOW_VALUE_STALE');
      requireRule(scalarType(observed.value) === policy.type, 'WORKFLOW_TYPE_MISMATCH');
      return observed.value;
    }
    const values = node.args.map(evaluate), a = values[0], b = values[1];
    switch (node.op) {
      case 'and': return values.every(value => value === true);
      case 'or': return values.some(value => value === true);
      case 'not': return !a;
      case 'eq': return a === b;
      case 'ne': return a !== b;
      case 'lt': return (a as number) < (b as number);
      case 'lte': return (a as number) <= (b as number);
      case 'gt': return (a as number) > (b as number);
      case 'gte': return (a as number) >= (b as number);
      default: {
        const x = BigInt(a as number), y = BigInt(b as number);
        if (node.op === 'divide') requireRule(y !== 0n && x % y === 0n, 'WORKFLOW_EXACT_DIVISION_REQUIRED');
        const result = node.op === 'add' ? x + y : node.op === 'subtract' ? x - y : node.op === 'multiply' ? x * y : x / y;
        requireRule(result <= BigInt(Number.MAX_SAFE_INTEGER) && result >= BigInt(Number.MIN_SAFE_INTEGER), 'WORKFLOW_ARITHMETIC_OVERFLOW');
        return Number(result);
      }
    }
  }
  return evaluate(expression);
}
