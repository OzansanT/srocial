import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function clone(value) { return structuredClone(value); }
function emptyData() { return { posts: [], publications: [], jobs: [] }; }

export function createJsonRepository({ filePath }) {
  let data = emptyData();
  let writeChain = Promise.resolve();

  async function persist() {
    const temporaryPath = `${filePath}.tmp`;
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
    await rename(temporaryPath, filePath);
  }

  async function mutate(collection, record) {
    const operation = writeChain.then(async () => {
      const item = { id: randomUUID(), ...clone(record) };
      data[collection].push(item);
      await persist();
      return clone(item);
    });
    writeChain = operation.then(() => undefined, () => undefined);
    return operation;
  }

  return {
    async initialize() {
      try {
        const parsed = JSON.parse(await readFile(filePath, 'utf8'));
        data = {
          posts: Array.isArray(parsed.posts) ? parsed.posts : [],
          publications: Array.isArray(parsed.publications) ? parsed.publications : [],
          jobs: Array.isArray(parsed.jobs) ? parsed.jobs : []
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
    async listJobs() { return clone(data.jobs).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)); },
    async listPostsWithPublications() {
      return clone(data.posts)
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
        .map((post) => ({ ...post, publications: clone(data.publications.filter((item) => item.postId === post.id)) }));
    }
  };
}
