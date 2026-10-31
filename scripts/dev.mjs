// Starts the API and the web app together without an extra dependency.
// Ctrl+C stops both.
import { spawn } from 'node:child_process';

const apps = [
  { name: 'api', workspace: '@approvals/api' },
  { name: 'web', workspace: '@approvals/web' },
];

const children = apps.map(({ name, workspace }) => {
  const child = spawn(`npm run dev -w ${workspace}`, { shell: true });
  const prefix = (line) => (line ? `[${name}] ${line}` : line);
  const pipe = (stream, out) =>
    stream.on('data', (chunk) => out.write(chunk.toString().split('\n').map(prefix).join('\n')));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

function shutdown(code) {
  for (const child of children) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
