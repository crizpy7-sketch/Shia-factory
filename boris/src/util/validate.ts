/**
 * Minimal structural validation with no dependencies.
 *
 * The model is never trusted to return a well-formed structure: every model-produced object and
 * every API request body passes through here before it can influence execution.
 */

export type FieldSpec =
  | { type: 'string'; required?: boolean; min?: number; max?: number; enum?: readonly string[]; pattern?: RegExp }
  | { type: 'number'; required?: boolean; min?: number; max?: number; integer?: boolean }
  | { type: 'boolean'; required?: boolean }
  | { type: 'object'; required?: boolean }
  | { type: 'array'; required?: boolean; of?: 'string' | 'number' | 'object'; max?: number };

export type Schema = Record<string, FieldSpec>;

export class ValidationError extends Error {
  constructor(message: string, public readonly issues: string[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface ValidationResult<T> {
  ok: boolean;
  value: T | null;
  issues: string[];
}

export function validate<T = Record<string, unknown>>(input: unknown, schema: Schema): ValidationResult<T> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, value: null, issues: ['expected an object'] };
  }
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, spec] of Object.entries(schema)) {
    const value = src[key];
    if (value === undefined || value === null) {
      if (spec.required) issues.push(`${key} is required`);
      continue;
    }
    switch (spec.type) {
      case 'string': {
        if (typeof value !== 'string') { issues.push(`${key} must be a string`); break; }
        if (spec.min !== undefined && value.length < spec.min) issues.push(`${key} must be at least ${spec.min} characters`);
        if (spec.max !== undefined && value.length > spec.max) issues.push(`${key} must be at most ${spec.max} characters`);
        if (spec.enum && !spec.enum.includes(value)) issues.push(`${key} must be one of: ${spec.enum.join(', ')}`);
        if (spec.pattern && !spec.pattern.test(value)) issues.push(`${key} has an invalid format`);
        out[key] = value;
        break;
      }
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) { issues.push(`${key} must be a finite number`); break; }
        if (spec.integer && !Number.isInteger(value)) issues.push(`${key} must be an integer`);
        if (spec.min !== undefined && value < spec.min) issues.push(`${key} must be >= ${spec.min}`);
        if (spec.max !== undefined && value > spec.max) issues.push(`${key} must be <= ${spec.max}`);
        out[key] = value;
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') { issues.push(`${key} must be a boolean`); break; }
        out[key] = value;
        break;
      }
      case 'object': {
        if (typeof value !== 'object' || Array.isArray(value)) { issues.push(`${key} must be an object`); break; }
        out[key] = value;
        break;
      }
      case 'array': {
        if (!Array.isArray(value)) { issues.push(`${key} must be an array`); break; }
        if (spec.max !== undefined && value.length > spec.max) issues.push(`${key} must have at most ${spec.max} entries`);
        if (spec.of) {
          const bad = value.some((v) =>
            spec.of === 'object' ? typeof v !== 'object' || v === null : typeof v !== spec.of);
          if (bad) issues.push(`${key} must contain only ${spec.of} values`);
        }
        out[key] = value;
        break;
      }
    }
  }
  return issues.length ? { ok: false, value: null, issues } : { ok: true, value: out as T, issues: [] };
}

export function validateOrThrow<T = Record<string, unknown>>(input: unknown, schema: Schema, what = 'input'): T {
  const result = validate<T>(input, schema);
  if (!result.ok || result.value === null) {
    throw new ValidationError(`Invalid ${what}: ${result.issues.join('; ')}`, result.issues);
  }
  return result.value;
}

/** Parses JSON that may be wrapped in prose or fenced code, as models frequently return. */
export function parseLooseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // try the next candidate
    }
  }
  return { ok: false, error: 'no parseable JSON object found' };
}
