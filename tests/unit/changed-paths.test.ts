import { describe, expect, it } from 'vitest';
import { listChangedPaths } from '../../src/collectors/changed-paths.js';

describe('listChangedPaths', () => {
  it('normalizes and dedupes PR files', async () => {
    const paths = await listChangedPaths(
      {
        async listPullFiles() {
          return ['src\\a.ts', 'src/a.ts', 'src/b.ts'];
        },
      },
      'o',
      'r',
      12,
    );
    expect(paths).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('rejects invalid pull numbers', async () => {
    await expect(
      listChangedPaths({ async listPullFiles() { return []; } }, 'o', 'r', 0),
    ).rejects.toThrow(/invalid/);
  });
});
