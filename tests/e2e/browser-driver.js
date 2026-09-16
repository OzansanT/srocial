import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const HOST = '127.0.0.1';
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const MIN_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_WAIT_TIMEOUT_MS = 5_000;
const CDP_REQUEST_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 50;
const SHUTDOWN_TIMEOUT_MS = 3_000;
const MAX_CHROME_DIAGNOSTIC_CHARS = 2_000;

export function resolveChromeStartupTimeoutMs(env = process.env) {
  const raw = env?.E2E_CHROME_STARTUP_TIMEOUT_MS;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_STARTUP_TIMEOUT_MS;
  }

  const value = Number(String(raw).trim());
  return Number.isInteger(value) && value >= MIN_STARTUP_TIMEOUT_MS
    ? value
    : DEFAULT_STARTUP_TIMEOUT_MS;
}

const STARTUP_TIMEOUT_MS = resolveChromeStartupTimeoutMs();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendDiagnostic(current, chunk) {
  const next = `${current}${String(chunk ?? '')}`;
  return next.length > MAX_CHROME_DIAGNOSTIC_CHARS
    ? next.slice(-MAX_CHROME_DIAGNOSTIC_CHARS)
    : next;
}

function attachDiagnostic(error, diagnostic) {
  const text = String(diagnostic ?? '').trim();
  if (text) error.cause = new Error(text);
  return error;
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

async function discoverDebugPort({ profileDirectory, child, getLaunchError, getDiagnostic }) {
  const activePortFile = path.join(profileDirectory, 'DevToolsActivePort');
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const launchError = getLaunchError();
    if (launchError) {
      throw attachDiagnostic(new Error('E2E_CHROME_LAUNCH_FAILED'), getDiagnostic());
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw attachDiagnostic(new Error('E2E_CHROME_EXITED'), getDiagnostic());
    }

    try {
      const content = await readFile(activePortFile, 'utf8');
      const [portLine] = content.split(/\r?\n/);
      const port = Number.parseInt(portLine, 10);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw attachDiagnostic(new Error('E2E_CHROME_ACTIVE_PORT_INVALID'), getDiagnostic());
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw attachDiagnostic(new Error('E2E_CHROME_STARTUP_TIMEOUT'), getDiagnostic());
}

async function discoverPageTarget(debugPort, child, getLaunchError, getDiagnostic) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const launchError = getLaunchError();
    if (launchError) {
      throw attachDiagnostic(new Error('E2E_CHROME_LAUNCH_FAILED'), getDiagnostic());
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw attachDiagnostic(new Error('E2E_CHROME_EXITED'), getDiagnostic());
    }
    try {
      const response = await fetch(`http://${HOST}:${debugPort}/json/list`, {
        signal: AbortSignal.timeout(1_000)
      });
      if (response.ok) {
        const targets = await response.json();
        const page = Array.isArray(targets)
          ? targets.find((target) => target?.type === 'page' && target?.webSocketDebuggerUrl)
          : null;
        if (page) return page;
      }
    } catch {
      // Remote debugger may be active before the initial page target is exposed.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw attachDiagnostic(new Error('E2E_CHROME_PAGE_TARGET_TIMEOUT'), getDiagnostic());
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
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
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
      clearTimeout(request.timer);
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
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`E2E_CDP_REQUEST_TIMEOUT_${method.replaceAll('.', '_')}`));
      }, CDP_REQUEST_TIMEOUT_MS);
      timer.unref?.();
      pending.set(id, { method, resolve, reject, timer });
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
  let socket;
  let cdp;
  let closed = false;
  let launchError = null;
  let diagnostic = '';

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-address=${HOST}`,
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDirectory}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  chrome.once('error', (error) => {
    launchError = error;
  });
  chrome.stderr?.on('data', (chunk) => {
    diagnostic = appendDiagnostic(diagnostic, chunk);
  });

  async function close() {
    if (closed) return;
    closed = true;
    cdp?.close();
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) socket.close();
    await stopChild(chrome);
    try {
      await rm(profileDirectory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100
      });
    } catch {
      // The profile is test-only temporary state; runner/process cleanup may finish a late Chrome writer.
    }
  }

  try {
    const getLaunchError = () => launchError;
    const getDiagnostic = () => diagnostic;
    const debugPort = await discoverDebugPort({
      profileDirectory,
      child: chrome,
      getLaunchError,
      getDiagnostic
    });
    const target = await discoverPageTarget(debugPort, chrome, getLaunchError, getDiagnostic);
    socket = await openWebSocket(target.webSocketDebuggerUrl);
    cdp = createCdpClient(socket);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');
  } catch (error) {
    if (!error.cause && diagnostic.trim()) attachDiagnostic(error, diagnostic);
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

  async function handleNextDialog({
    accept = true,
    promptText,
    type,
    message,
    timeoutMs = DEFAULT_WAIT_TIMEOUT_MS
  } = {}) {
    const dialog = await cdp.waitForEvent('Page.javascriptDialogOpening', timeoutMs);
    const mismatch = [];
    if (type !== undefined && dialog.type !== String(type)) mismatch.push('type');
    if (message !== undefined && dialog.message !== String(message)) mismatch.push('message');

    const params = { accept: Boolean(accept) };
    if (accept && promptText !== undefined) params.promptText = String(promptText);
    await cdp.send('Page.handleJavaScriptDialog', params);

    if (mismatch.length) throw new Error(`E2E_DIALOG_MISMATCH_${mismatch.join('_').toUpperCase()}`);
    return {
      type: dialog.type ?? null,
      message: dialog.message ?? '',
      defaultPrompt: dialog.defaultPrompt ?? ''
    };
  }

  async function navigate(url) {
    const targetUrl = String(url);
    const previousUrl = await evaluate('location.href').catch(() => null);
    const result = await cdp.send('Page.navigate', { url: targetUrl });
    if (result.errorText) throw new Error('E2E_NAVIGATION_FAILED');
    await waitFor(`(() => {
      if (document.readyState !== 'complete') return false;
      const target = new URL(${serialize(targetUrl)}, location.href).href;
      const previous = ${serialize(previousUrl)};
      return location.href === target || previous === null || location.href !== previous;
    })()`, { timeoutMs: STARTUP_TIMEOUT_MS });
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

  async function setFileInputFiles(selector, filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      throw new Error('E2E_FILE_PATHS_REQUIRED');
    }
    const files = filePaths.map((value) => String(value));
    const { root } = await cdp.send('DOM.getDocument', { depth: 1, pierce: true });
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: String(selector)
    });
    if (!nodeId) throw new Error('E2E_FILE_INPUT_NOT_FOUND');
    await cdp.send('DOM.setFileInputFiles', { nodeId, files });
    return true;
  }

  return Object.freeze({
    navigate,
    evaluate,
    waitFor,
    handleNextDialog,
    fill,
    click,
    submit,
    setFileInputFiles,
    close
  });
}
