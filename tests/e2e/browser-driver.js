import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const HOST = '127.0.0.1';
const STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_WAIT_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 50;
const SHUTDOWN_TIMEOUT_MS = 3_000;

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
  if (!Number.isInteger(port)) throw new Error('E2E_BROWSER_PORT_ALLOCATION_FAILED');
  return port;
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser path.
    }
  }
  throw new Error('E2E_CHROME_NOT_FOUND');
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
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

async function discoverPageTarget(debugPort, child) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('E2E_CHROME_EXITED');
    try {
      const response = await fetch(`http://${HOST}:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = Array.isArray(targets) ? targets.find((target) => target?.type === 'page' && target?.webSocketDebuggerUrl) : null;
        if (page) return page;
      }
    } catch {
      // Remote debugger is not listening yet.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('E2E_CHROME_STARTUP_TIMEOUT');
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const cleanup = () => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
    };
    const onOpen = () => {
      cleanup();
      resolve(socket);
    };
    const onError = () => {
      cleanup();
      reject(new Error('E2E_CDP_CONNECTION_FAILED'));
    };
    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('error', onError, { once: true });
  });
}

function createCdpClient(socket) {
  let nextId = 1;
  let closed = false;
  const pending = new Map();
  const eventWaiters = new Map();

  function rejectOutstanding(error) {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
    for (const waiters of eventWaiters.values()) {
      for (const waiter of waiters) waiter.reject(error);
    }
    eventWaiters.clear();
  }

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }

    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) {
        const error = new Error(`E2E_CDP_${request.method.replaceAll('.', '_')}_${message.error.code ?? 'ERROR'}`);
        request.reject(error);
      } else {
        request.resolve(message.result ?? {});
      }
      return;
    }

    const waiters = eventWaiters.get(message.method);
    if (!waiters?.length) return;
    eventWaiters.delete(message.method);
    for (const waiter of waiters) waiter.resolve(message.params ?? {});
  });

  socket.addEventListener('close', () => {
    closed = true;
    rejectOutstanding(new Error('E2E_CDP_CLOSED'));
  });

  function send(method, params = {}) {
    if (closed || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('E2E_CDP_NOT_OPEN'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { method, resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function waitForEvent(method, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
    if (closed) return Promise.reject(new Error('E2E_CDP_CLOSED'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = eventWaiters.get(method) ?? [];
        eventWaiters.set(method, waiters.filter((entry) => entry !== waiter));
        reject(new Error(`E2E_CDP_EVENT_TIMEOUT_${method.replaceAll('.', '_')}`));
      }, timeoutMs);
      timer.unref?.();
      const waiter = {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        }
      };
      const waiters = eventWaiters.get(method) ?? [];
      waiters.push(waiter);
      eventWaiters.set(method, waiters);
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    rejectOutstanding(new Error('E2E_CDP_CLOSED'));
    try {
      socket.close();
    } catch {
      // Browser cleanup still terminates Chrome below.
    }
  }

  return Object.freeze({ send, waitForEvent, close });
}

function serialize(value) {
  return JSON.stringify(value);
}

export async function launchBrowser() {
  const chromePath = await findChrome();
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'srocial-chrome-'));
  const debugPort = await getFreePort();
  let socket;
  let cdp;
  let closed = false;

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-address=${HOST}`,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  async function close() {
    if (closed) return;
    closed = true;
    try {
      cdp?.close();
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) socket.close();
      await stopChild(chrome);
    } finally {
      await rm(profileDirectory, { recursive: true, force: true });
    }
  }

  try {
    const target = await discoverPageTarget(debugPort, chrome);
    socket = await openWebSocket(target.webSocketDebuggerUrl);
    cdp = createCdpClient(socket);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
  } catch (error) {
    await close();
    throw error;
  }

  async function evaluate(expression) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: String(expression),
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails?.exception?.description ?? result.exceptionDetails?.text ?? 'evaluation failed';
      throw new Error(`E2E_EVALUATION_FAILED: ${description}`);
    }
    return result.result?.value;
  }

  async function waitFor(expression, { timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(expression)) return true;
        lastError = null;
      } catch (error) {
        lastError = error;
      }
      await sleep(intervalMs);
    }
    const error = new Error('E2E_WAIT_TIMEOUT');
    if (lastError) error.cause = lastError;
    throw error;
  }

  async function navigate(url) {
    const loaded = cdp.waitForEvent('Page.loadEventFired', STARTUP_TIMEOUT_MS);
    const result = await cdp.send('Page.navigate', { url: String(url) });
    if (result.errorText) throw new Error('E2E_NAVIGATION_FAILED');
    await loaded;
    return result;
  }

  async function fill(selector, value) {
    return evaluate(`(() => {
      const element = document.querySelector(${serialize(selector)});
      if (!element) throw new Error('ELEMENT_NOT_FOUND');
      element.focus();
      element.value = ${serialize(String(value))};
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
  }

  async function click(selector) {
    return evaluate(`(() => {
      const element = document.querySelector(${serialize(selector)});
      if (!element) throw new Error('ELEMENT_NOT_FOUND');
      element.click();
      return true;
    })()`);
  }

  async function submit(selector) {
    return evaluate(`(() => {
      const form = document.querySelector(${serialize(selector)});
      if (!form) throw new Error('FORM_NOT_FOUND');
      form.requestSubmit();
      return true;
    })()`);
  }

  return Object.freeze({
    navigate,
    evaluate,
    waitFor,
    fill,
    click,
    submit,
    close
  });
}
