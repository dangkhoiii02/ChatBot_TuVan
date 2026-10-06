import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE, seedAdversarialFixtures } from './adversarial-fixtures.mjs';
import { seedManualE2E } from './manual-e2e-fixtures.mjs';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendDir = path.resolve(backendDir, '../frontend');
const persistentPath=process.env.FIXTURE_DATABASE_PATH?path.resolve(process.env.FIXTURE_DATABASE_PATH):null;
if(persistentPath&&!/^manual-e2e[\w.-]*\.(db|sqlite)$/.test(path.basename(persistentPath)))throw new Error('Persistent fixture filename must start with manual-e2e and end in .db or .sqlite.');
const tempDir=persistentPath?path.dirname(persistentPath):fs.mkdtempSync(path.join(os.tmpdir(),'p0p1-fixture-ui-'));
fs.mkdirSync(tempDir,{recursive:true});
if(persistentPath&&process.env.FIXTURE_RESET==='1')for(const suffix of ['', '-wal','-shm'])fs.rmSync(persistentPath+suffix,{force:true});
const sessionSecret = randomBytes(32).toString('hex');
const backendPort = process.env.FIXTURE_BACKEND_PORT || '4000';
const frontendPort = process.env.FIXTURE_FRONTEND_PORT || '5180';
const isolatedEnv = {
  ...process.env,
  NODE_ENV: 'test',
  BACKEND_DATABASE_PATH: persistentPath||path.join(tempDir, 'app.sqlite'),
  APP_SESSION_SECRET: sessionSecret,
  PANCAKE_PAGE_ID: FIXTURE.pageId,
  PANCAKE_PAGE_ACCESS_TOKEN: process.env.FIXTURE_SCENARIO==='manual-e2e'?'fixture-page-token-not-real':'',
  PANCAKE_BASE_URL: process.env.FIXTURE_SCENARIO==='manual-e2e'?'https://fixture-pancake.invalid/api':'https://pages.fm/api',
  PANCAKE_ACTIVE_USER_IDS: '',
  ALLOW_DEV_USER_HEADER: '0',
  ALLOW_DEMO_MODE: '1',
  AI_PROVIDER: 'openai',
  AI_PROVIDER_API_KEY: 'fixture-key-not-real',
  AI_PROVIDER_MODEL: 'fixture-chat',
  OPENAI_BASE_URL: 'https://fixture-ai.invalid/v1',
  AI_BASE_URL: 'https://fixture-ai.invalid/v1',
  AI_API_KEY: '',
  OPENAI_API_KEY: '',
  GEMINI_API_KEY: '',
  PORT: backendPort,
  CORS_ORIGINS: `http://127.0.0.1:${frontendPort},http://localhost:${frontendPort}`
};

try {
  execFileSync('npm', ['run', 'build'], { cwd: backendDir, env: isolatedEnv, stdio: 'inherit' });
  Object.assign(process.env, isolatedEnv);
  const [{ getDatabase }, { issueAppSession }] = await Promise.all([
    import('../dist/db/index.js'), import('../dist/services/sessionToken.js')
  ]);
  const db = getDatabase();
  seedAdversarialFixtures(db);
  if(process.env.FIXTURE_SCENARIO==='manual-e2e')seedManualE2E(db);
  db.close();
  const sessionToken = issueAppSession({ userId: FIXTURE.staffId, pageId: FIXTURE.pageId });
  const backend = spawn(process.execPath, ['tests/fixture-ai-server.mjs'], { cwd: backendDir, env: isolatedEnv, stdio: 'inherit' });
  const frontend = spawn(process.execPath, [path.join(frontendDir, 'node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1', '--port', frontendPort, '--strictPort'], {
    cwd: frontendDir,
    env: { ...isolatedEnv, VITE_API_BASE_URL: `http://127.0.0.1:${backendPort}`, VITE_TEST_SESSION_TOKEN: sessionToken },
    stdio: 'inherit'
  });
  let closing = false;
  const stop = (exitCode = 0) => {
    if (closing) return;
    closing = true;
    backend.kill('SIGTERM');
    frontend.kill('SIGTERM');
    setTimeout(() => {
      if(!persistentPath)fs.rmSync(tempDir, { recursive: true, force: true });
      process.exit(exitCode);
    }, 300);
  };
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
  backend.on('exit', (code) => { if (!closing) stop(code || 1); });
  frontend.on('exit', (code) => { if (!closing) stop(code || 1); });
  console.log(`Fixture UI: http://127.0.0.1:${frontendPort}/ (fake ${FIXTURE.staffId}, ${FIXTURE.pageId}; ${persistentPath?'persistent test SQLite':'temporary SQLite'})`);
} catch (error) {
  if(!persistentPath)fs.rmSync(tempDir, { recursive: true, force: true });
  throw error;
}
