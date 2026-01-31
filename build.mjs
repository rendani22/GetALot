#!/usr/bin/env node
import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname);

console.log('Building Angular app from:', projectRoot);
console.log('Current working directory:', process.cwd());

// Change to project root to ensure Angular CLI finds angular.json
process.chdir(projectRoot);
console.log('Changed to:', process.cwd());

const ngPath = resolve(projectRoot, 'node_modules', '.bin', 'ng');
const args = ['build', '--configuration', 'production'];

console.log('Running:', ngPath, args.join(' '));

const child = spawn(ngPath, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NG_CLI_ANALYTICS: 'false' }
});

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (err) => {
  console.error('Failed to start build:', err);
  process.exit(1);
});
