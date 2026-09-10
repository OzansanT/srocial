import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { JOB_STATES } from '../scheduler/job-states.js';

function clone(value) { return structuredClone(value); }
function emptyData() { return { posts: [], publications: [], jobs: [], accounts: [], oauthStates: [] }; }

export function createJsonRepository({ filePath }) {
  let data = emptyData();
  let writeChain = Promise.resolve();

  async function persist() {
    const temporaryPath = `${filePath}.tmp`;
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
    await rename(temporaryPath, filePath);
  }

  function enqueueMutation(operation) {
    const result = writeChain.then(async () => {
      const value = await operation();
      await persist();
      return clone(value);
    });
    writeChain = result.then(() => undefined, () => undefined);
    return result;
  }

  function mutate(collection, record) {
    return enqueueMutation(() => {
      const item = { id: randomUUID(), ...clone(record) };
      data[collection].push(item);
      return item;
    });
  }

  function update(collection, id, patch) {
    return enqueueMutation(() => {
      const item = data[collection].find((candidate) => candidate.id === id);
      if (!item) return null;
      Object.assign(item, clone(patch), { id: item.id });
      return item;
    });
  }

  async function stableRead(read) {
    await writeChain;
    return clone(read());
  }

  return {
    async initialize() {
      try {
        const parsed = JSON.parse(await readFile(filePath, 'utf8'));
        data = {
          posts: Array.isArray(parsed.posts) ? parsed.posts : [],
          publications: Array.isArray(parsed.publications) ? parsed.publications : [],
          jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
          accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
          oauthStates: Array.isArray(parsed.oauthStates) ? parsed.oauthStates : []
        };
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        data = emptyData();
        await persist();
      }
    },
    createPost(record) { return mutate('posts', record); },
    createPublication(record) { return mutate('publications', record); },
    createJob(record) { return mutate('jobs', record); },
    createAccount(record) { return mutate('accounts', record); },
    createOAuthState(record) { return mutate('oauthStates', record); },
    consumeOAuthState({ provider, stateHash, now = new Date() }) {
      return enqueueMutation(() => {
        const item = data.oauthStates.find((candidate) => candidate.provider === provider && candidate.stateHash === stateHash);
        if (!item || item.consumedAt) return { status: 'invalid', record: null };
        const nowMs = now.getTime();
        const expiresMs = Date.parse(item.expiresAt);
        if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return { status: 'expired', record: item };
        item.consumedAt = now.toISOString();
        return { status: 'ok', record: item };
      });
    },
    getAccount(id) { return stableRead(() => data.accounts.find((item) => item.id === id) ?? null); },
    listAccounts() { return stableRead(() => [...data.accounts]); },
    disconnectAccount(id) {
      return enqueueMutation(() => {
        const item = data.accounts.find((candidate) => candidate.id === id);
        if (!item) return null;
        item.connected = false;
        item.accessTokenEncrypted = null;
        item.refreshTokenEncrypted = null;
        item.tokenExpiresAt = null;
        item.updatedAt = new Date().toISOString();
        return item;
      });
    },
    updatePublication(id, patch) { return update('publications', id, patch); },
    updateJob(id, patch) { return update('jobs', id, patch); },
    getPost(id) { return stableRead(() => data.posts.find((item) => item.id === id) ?? null); },
    getPublication(id) { return stableRead(() => data.publications.find((item) => item.id === id) ?? null); },
    async claimDueJobs({ now = new Date(), workerId, limit = 10, lockTimeoutMs = 120000 } = {}) {
      if (!String(workerId ?? '').trim()) throw new Error('workerId is required');
      const nowMs = now.getTime();
      const staleBefore = nowMs - Math.max(0, Number(lockTimeoutMs) || 0);
      const maxJobs = Math.max(0, Number.parseInt(limit, 10) || 0);
      if (maxJobs === 0) return [];

      return enqueueMutation(() => {
        const eligible = data.jobs
          .filter((job) => {
            const scheduledMs = Date.parse(job.scheduledAt);
            if (!Number.isFinite(scheduledMs) || scheduledMs > nowMs) return false;

            if (job.state === JOB_STATES.SCHEDULED || job.state === JOB_STATES.RETRYING) return true;
            if (job.state !== JOB_STATES.RUNNING) return false;

            const lockedMs = Date.parse(job.lockedAt ?? '');
            return !Number.isFinite(lockedMs) || lockedMs <= staleBefore;
          })
          .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
          .slice(0, maxJobs);

        const timestamp = now.toISOString();
        for (const job of eligible) {
          job.state = JOB_STATES.RUNNING;
          job.lockedAt = timestamp;
          job.lockedBy = workerId;
          job.attempts = Number(job.attempts ?? 0) + 1;
          job.updatedAt = timestamp;
        }
        return eligible;
      });
    },
    listJobs() {
      return stableRead(() => [...data.jobs].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)));
    },
    listPostsWithPublications() {
      return stableRead(() => [...data.posts]
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
        .map((post) => ({ ...post, publications: data.publications.filter((item) => item.postId === post.id) })));
    }
  };
}
