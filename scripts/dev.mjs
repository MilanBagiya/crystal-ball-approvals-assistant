// Starts the API and the web app together without an extra dependency.
// Ctrl+C stops both. Ports come from the shell or the root .env: API_PORT (default 4000), WEB_PORT (default 3000).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import dotenv from 'dotenv';

// Read .env without changing process.env, so shell variables still win and each app keeps loading .env itself.
const fileEnv = fs.existsSync('.env') ? dotenv.parse(fs.readFileSync('.env')) : {};
const setting = (name, fallback) => process.env[name] || fileEnv[name] || fallback;

const apiPort = setting('API_PORT', '4000');
const webPort = setting('WEB_PORT', '3000');

const apps = [
  { name: 'api', workspace: '@approvals/api', env: { API_PORT: apiPort } },
  {
    name: 'web',
    workspace: '@approvals/web',
    // Next.js reads PORT; API_ORIGIN points the /api proxy at the API's port.
    env: { PORT: webPort, API_ORIGIN: setting('API_ORIGIN', `http://localhost:${apiPort}`) },
  },
];

console.log(`Starting API on :${apiPort} and web on :${webPort} (open http://localhost:${webPort})`);

const children = apps.map(({ name, workspace, env }) => {
  const child = spawn(`npm run dev -w ${workspace}`, { shell: true, env: { ...process.env, ...env } });
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

// With `shell: true`, child.kill() only stops the shell. On Windows the app it started would be orphaned
// (still holding its port), so kill the whole process tree there.
function stop(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill();
}

function shutdown(code) {
  for (const child of children) stop(child);
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
