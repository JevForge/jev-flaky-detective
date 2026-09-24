import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

function actionInputs(actionPath: string): Set<string> {
  const action = parse(readFileSync(actionPath, 'utf8')) as { inputs?: Record<string, unknown> };
  return new Set(Object.keys(action.inputs ?? {}));
}

describe('example workflow contracts', () => {
  it('references only inputs declared by the selected action', () => {
    const root = process.cwd();
    const mainInputs = actionInputs(join(root, 'action.yml'));
    const appendInputs = actionInputs(join(root, 'append-history', 'action.yml'));
    const examples = readdirSync(join(root, 'examples')).filter(name => name.endsWith('.yml'));

    function visit(value: unknown, example: string): void {
      if (Array.isArray(value)) {
        for (const item of value) visit(item, example);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const row = value as Record<string, unknown>;
      if (typeof row.uses === 'string' && row.uses.startsWith('JevForge/jev-flaky-detective')) {
        const allowed = row.uses.includes('/append-history@') ? appendInputs : mainInputs;
        const withValues = row.with && typeof row.with === 'object' ? row.with as Record<string, unknown> : {};
        for (const input of Object.keys(withValues)) {
          expect(allowed.has(input), `${example} references undeclared input ${input}`).toBe(true);
        }
      }
      for (const child of Object.values(row)) visit(child, example);
    }

    for (const example of examples) {
      const workflow = parse(readFileSync(join(root, 'examples', example), 'utf8')) as { jobs?: Record<string, unknown> };
      const jobs = workflow.jobs ?? {};
      expect(JSON.stringify(jobs)).toContain('JevForge/jev-flaky-detective');
      visit(jobs, example);
    }
  });
});
