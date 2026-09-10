import { resolve } from 'node:path';
import { createJsonRepository } from './json-repository.js';

export function createRepositoryFromEnvironment(env = process.env) {
  const filePath = resolve(env.DATA_FILE ?? './data/srocial.json');
  return createJsonRepository({ filePath });
}
