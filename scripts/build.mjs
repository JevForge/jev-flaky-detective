import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  sourcemap: false,
  legalComments: 'none',
  packages: 'bundle',
  logLevel: 'info',
};

await build({
  ...shared,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
});

await build({
  ...shared,
  entryPoints: ['src/history/cli.ts'],
  outfile: 'dist/append-history.js',
});

mkdirSync(resolve('dist'), { recursive: true });
writeFileSync(resolve('dist/package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));

console.log('Built dist/index.js and dist/append-history.js');
