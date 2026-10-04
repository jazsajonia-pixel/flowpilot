type SchemaRecord = Record<string, unknown>;

type ValidationBudget = { schemas: number };

const supportedTypes = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const supportedKeywords = new Set([
  'type', 'properties', 'required', 'items', 'enum', 'description', 'title',
  'additionalProperties', 'minimum', 'maximum', 'minItems', 'maxItems', 'format',
]);
const forbiddenPropertyNames = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_SCHEMA_CHARACTERS = 8_192;
const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_NODES = 128;

function isRecord(value: unknown): value is SchemaRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireBoundedNumber(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error('The response schema is invalid.');
  }
  return value;
}

function validateSchemaNode(schema: SchemaRecord, depth: number, budget: ValidationBudget): void {
  budget.schemas += 1;
  if (depth > MAX_SCHEMA_DEPTH || budget.schemas > MAX_SCHEMA_NODES) {
    throw new Error('The response schema is too complex.');
  }
  if (Object.keys(schema).some((key) => !supportedKeywords.has(key))) {
    throw new Error('The response schema uses an unsupported feature.');
  }

  const typeValue = schema.type;
  const types = typeof typeValue === 'string' ? [typeValue] : Array.isArray(typeValue) ? typeValue : [];
  if (types.length === 0 || types.length > 2 || types.some((type) => typeof type !== 'string' || !supportedTypes.has(type))) {
    throw new Error('The response schema must declare a supported type.');
  }

  for (const key of ['title', 'description'] as const) {
    if (schema[key] !== undefined && (typeof schema[key] !== 'string' || schema[key].length > 512)) {
      throw new Error('The response schema is invalid.');
    }
  }
  if (schema.format !== undefined && !['date', 'date-time', 'time'].includes(String(schema.format))) {
    throw new Error('The response schema uses an unsupported format.');
  }

  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.length > 100) {
      throw new Error('The response schema enum is invalid.');
    }
    if (schema.enum.some((value) => value !== null && !['string', 'number', 'boolean'].includes(typeof value))) {
      throw new Error('The response schema enum is invalid.');
    }
  }

  if (schema.minimum !== undefined) requireBoundedNumber(schema.minimum, -1_000_000_000, 1_000_000_000);
  if (schema.maximum !== undefined) requireBoundedNumber(schema.maximum, -1_000_000_000, 1_000_000_000);
  if (typeof schema.minimum === 'number' && typeof schema.maximum === 'number' && schema.minimum > schema.maximum) {
    throw new Error('The response schema range is invalid.');
  }

  if (schema.minItems !== undefined) requireBoundedNumber(schema.minItems, 0, 100);
  if (schema.maxItems !== undefined) requireBoundedNumber(schema.maxItems, 0, 100);
  if (typeof schema.minItems === 'number' && !Number.isInteger(schema.minItems)) throw new Error('The response schema is invalid.');
  if (typeof schema.maxItems === 'number' && !Number.isInteger(schema.maxItems)) throw new Error('The response schema is invalid.');
  if (typeof schema.minItems === 'number' && typeof schema.maxItems === 'number' && schema.minItems > schema.maxItems) {
    throw new Error('The response schema range is invalid.');
  }

  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties) || Object.keys(schema.properties).length > 64) {
      throw new Error('The response schema properties are invalid.');
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (key.length > 128 || forbiddenPropertyNames.has(key) || !isRecord(child)) {
        throw new Error('The response schema properties are invalid.');
      }
      validateSchemaNode(child, depth + 1, budget);
    }
  }

  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.length > 64 || schema.required.some((key) => typeof key !== 'string' || key.length > 128 || forbiddenPropertyNames.has(key))) {
      throw new Error('The response schema required list is invalid.');
    }
    if (isRecord(schema.properties) && schema.required.some((key) => !Object.prototype.hasOwnProperty.call(schema.properties, key))) {
      throw new Error('The response schema required list must refer to declared properties.');
    }
  }

  if (schema.items !== undefined) {
    if (!isRecord(schema.items)) throw new Error('The response schema items are invalid.');
    validateSchemaNode(schema.items, depth + 1, budget);
  }
  if (types.includes('array') && schema.items === undefined) {
    throw new Error('Array response schemas must define item types.');
  }

  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') {
    if (!isRecord(schema.additionalProperties)) throw new Error('The response schema additionalProperties setting is invalid.');
    validateSchemaNode(schema.additionalProperties, depth + 1, budget);
  }
}

export function parseResponseJsonSchema(source: string): SchemaRecord {
  if (source.length === 0 || source.length > MAX_SCHEMA_CHARACTERS) {
    throw new Error('The response schema is missing or too long.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('The response schema must be valid JSON.');
  }
  if (!isRecord(parsed)) throw new Error('The response schema must be a JSON Schema object.');
  validateSchemaNode(parsed, 0, { schemas: 0 });
  return parsed;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'object') return isRecord(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'boolean') return typeof value === 'boolean';
  return value === null;
}

function assertSchemaMatch(value: unknown, schema: SchemaRecord, depth: number): void {
  if (depth > MAX_SCHEMA_DEPTH) throw new Error('The structured AI response did not match its schema.');
  const types = typeof schema.type === 'string' ? [schema.type] : Array.isArray(schema.type) ? schema.type : [];
  if (!types.some((type) => typeof type === 'string' && matchesType(value, type))) {
    throw new Error('The structured AI response did not match its schema.');
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    throw new Error('The structured AI response did not match its schema.');
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) throw new Error('The structured AI response did not match its schema.');
    if (typeof schema.maximum === 'number' && value > schema.maximum) throw new Error('The structured AI response did not match its schema.');
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) throw new Error('The structured AI response did not match its schema.');
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) throw new Error('The structured AI response did not match its schema.');
    if (isRecord(schema.items)) value.forEach((entry) => assertSchemaMatch(entry, schema.items as SchemaRecord, depth + 1));
  }
  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (required.some((key) => typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error('The structured AI response did not match its schema.');
    }
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.prototype.hasOwnProperty.call(properties, key))) {
      throw new Error('The structured AI response did not match its schema.');
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        const childSchema = properties[key];
        if (isRecord(childSchema)) assertSchemaMatch(child, childSchema, depth + 1);
      } else if (isRecord(schema.additionalProperties)) {
        assertSchemaMatch(child, schema.additionalProperties, depth + 1);
      }
    }
  }
}

export function parseStructuredJsonResponse(text: string, schema?: SchemaRecord): unknown {
  if (text.length > 64 * 1024) throw new Error('The structured AI response exceeded the size limit.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('The AI response was not valid JSON.');
  }
  if (schema) assertSchemaMatch(value, schema, 0);
  return value;
}
