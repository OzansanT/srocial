import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const ADMIN = Object.freeze({
  username: 'e2e-admin',
  password: 'E2E-Admin-Password-123!'
});
const SESSION_SECRET = 'e2e-session-secret-0123456789abcdef0123456789abcdef';
const STARTUP_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 3_000;
const POLL_INTERVAL_MS = 100;
const MAX_LOG_CHARS = 4_000;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: HOST, port: 0 }, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (!Number.isInteger(port)) throw new Error('E2E_PORT_ALLOCATION_FAILED');
  return port;
}

function appendLog(current, chunk) {
  const next = `${current}${String(chunk ?? '')}`;
  return next.length > MAX_LOG_CHARS ? next.slice(-MAX_LOG_CHARS) : next;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    timer.unref?.();

    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
    };
    child.once('exit', onExit);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
  }
}

async function waitForHealth({ baseUrl, child, getLogs }) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      const error = new Error('E2E_SERVER_EXITED');
      error.cause = getLogs();
      throw error;
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is not accepting connections yet.
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const error = new Error('E2E_SERVER_STARTUP_TIMEOUT');
  error.cause = getLogs();
  throw error;
}

export async function startSrocialE2EServer() {
  const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), 'srocial-e2e-'));
  const port = await getFreePort();
  const baseUrl = `http://${HOST}:${port}`;
  let logs = '';
  let closed = false;

  const env = {
    ...process.env,
    HOST,
    PORT: String(port),
    PUBLIC_BASE_URL: baseUrl,
    APP_AUTH_ENABLED: 'true',
    ADMIN_USERNAME: ADMIN.username,
    ADMIN_PASSWORD: ADMIN.password,
    SESSION_SECRET,
    LOGIN_RATE_LIMIT_MAX: '100',
    API_RATE_LIMIT_MAX: '5000',
    DATABASE_DRIVER: 'json',
    DATA_FILE: path.join(fixtureDirectory, 'srocial.json'),
    MEDIA_STORAGE_DRIVER: 'local',
    MEDIA_UPLOAD_DIR: path.join(fixtureDirectory, 'media'),
    MEDIA_ORPHAN_CLEANUP_ENABLED: 'false',
    SCHEDULER_ENABLED: 'false',
    ALLOW_REAL_PUBLISH: 'false',
    ALLOW_REAL_WHATSAPP: 'false',
    INSTAGRAM_APP_ID: '',
    INSTAGRAM_APP_SECRET: '',
    FACEBOOK_APP_ID: '',
    FACEBOOK_APP_SECRET: '',
    THREADS_APP_ID: '',
    THREADS_APP_SECRET: '',
    TIKTOK_CLIENT_KEY: '',
    TIKTOK_CLIENT_SECRET: '',
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    WHATSAPP_BUSINESS_ACCOUNT_ID: '',
    WHATSAPP_VERIFY_TOKEN: '',
    WHATSAPP_APP_SECRET: ''
  };

  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (chunk) => { logs = appendLog(logs, chunk); });
  child.stderr?.on('data', (chunk) => { logs = appendLog(logs, chunk); });

  async function close() {
    if (closed) return;
    closed = true;
    try {
      await stopChild(child);
    } finally {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  }

  try {
    await waitForHealth({ baseUrl, child, getLogs: () => logs });
  } catch (error) {
    await close();
    throw error;
  }

  return Object.freeze({
    baseUrl,
    admin: ADMIN,
    close
  });
}
