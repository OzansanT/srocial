import { createServer } from 'node:http';
import { createRequestHandler } from './app.js';
import { createRepositoryFromEnvironment } from './db/create-repository.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const repository = createRepositoryFromEnvironment();
await repository.initialize();

const server = createServer(createRequestHandler({ repository }));
server.listen(port, host, () => {
  console.log(`Srocial listening on http://${host}:${port}`);
});
