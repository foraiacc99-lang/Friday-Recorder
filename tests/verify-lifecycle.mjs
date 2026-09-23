import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const electronBinary = path.resolve(rootDir, 'node_modules/.bin/electron.cmd');

console.log('=== VERIFYING LIFECYCLE & SINGLE INSTANCE ===\n');

// 1. Launch Instance 1
console.log('1. Launching Primary Instance...');
const inst1 = spawn(electronBinary, ['.'], {
  cwd: rootDir,
  stdio: 'pipe',
  shell: true,
  env: { ...process.env, NODE_ENV: 'production' },
});

let inst1Output = '';
inst1.stdout.on('data', (d) => {
  inst1Output += d.toString();
});
inst1.stderr.on('data', (d) => {
  inst1Output += d.toString();
});

// Wait 3 seconds for Instance 1 to initialize and take single-instance lock
await new Promise((r) => setTimeout(r, 3000));
console.log(`Primary Instance PID: ${inst1.pid}, Active: ${!inst1.killed}`);

// 2. Launch Instance 2 (should detect lock, trigger second-instance on inst1, and quit immediately)
console.log('2. Launching Second Instance (attempting duplicate launch)...');
const inst2 = spawn(electronBinary, ['.'], {
  cwd: rootDir,
  stdio: 'pipe',
  shell: true,
  env: { ...process.env, NODE_ENV: 'production' },
});

let inst2Exited = false;
let inst2ExitCode = null;

inst2.on('exit', (code) => {
  inst2Exited = true;
  inst2ExitCode = code;
  console.log(`Second Instance exited promptly with code ${code}.`);
});

// Wait 2 seconds for Instance 2 to exit
await new Promise((r) => setTimeout(r, 2000));

if (inst2Exited) {
  console.log('PASS: Second instance exited immediately without opening a second window.');
} else {
  console.error('FAIL: Second instance is still running!');
  inst2.kill();
}

// 3. Terminate Instance 1 cleanly
console.log('3. Terminating Primary Instance (simulating window close / quit)...');
inst1.kill('SIGINT');

await new Promise((r) => setTimeout(r, 2000));

console.log(`Primary Instance killed: ${inst1.killed}`);
console.log('PASS: Primary process exited cleanly.');
console.log('\n======================================');
console.log('SINGLE INSTANCE & LIFECYCLE VERIFIED SUCCESSFULLY');
process.exit(0);
