// Sandbox-friendly path: compile tests in the workspace, then let Vitest load
// native JS without its temporary TypeScript module loader. No elevation.
import { build } from 'esbuild';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

await mkdir('test-results/unit', { recursive: true });
for (const name of (await readdir('tests')).filter(n => n.endsWith('.test.ts'))) {
  const source = await readFile(path.join('tests', name), 'utf8');
  await build({ entryPoints: [path.join('tests', name)], outfile: path.join('test-results/unit', name.replace('.ts', '.mjs')), bundle: true, platform: 'node', format: 'esm', packages: 'external', banner: { js: source.includes('@vitest-environment happy-dom') ? '// @vitest-environment happy-dom' : '' } });
}
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'test-results/unit', '--experimental.viteModuleRunner=false', '--experimental.nodeLoader=false', ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code || 0; });
