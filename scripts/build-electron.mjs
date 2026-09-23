import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isDev = process.env.NODE_ENV === 'development';

async function buildElectron() {
  await Promise.all([
    esbuild.build({
      entryPoints: [path.resolve(rootDir, 'electron/main/index.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      external: ['electron'],
      outfile: path.resolve(rootDir, 'dist-electron/main/index.js'),
      sourcemap: isDev ? 'inline' : false,
      minify: !isDev,
    }),
    esbuild.build({
      entryPoints: [path.resolve(rootDir, 'electron/preload/index.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      external: ['electron'],
      outfile: path.resolve(rootDir, 'dist-electron/preload/index.js'),
      sourcemap: isDev ? 'inline' : false,
      minify: !isDev,
    }),
  ]);
  console.log('Electron main & preload build complete.');
}

buildElectron().catch((err) => {
  console.error('Failed to build Electron:', err);
  process.exit(1);
});
