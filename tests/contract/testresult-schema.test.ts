import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TestResultSchema } from '../../src/schemas/detective.js';

describe('canonical TestResult contract', () => {
  it('validates the documented example and exposes a JSON Schema', () => {
    const root = process.cwd();
    const schema = JSON.parse(readFileSync(join(root, 'docs', 'test-result.schema.json'), 'utf8')) as {
      $schema?: string;
      $defs?: Record<string, unknown>;
    };
    const example = JSON.parse(readFileSync(join(root, 'docs', 'test-result.example.json'), 'utf8')) as unknown;

    expect(schema.$schema).toContain('json-schema.org');
    expect(schema.$defs?.TestResult).toBeDefined();
    expect(() => TestResultSchema.parse(example)).not.toThrow();
    expect(() => TestResultSchema.parse({ test_id: 'x', status: 'not-a-status' })).toThrow();
  });
});
