import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';

let server: ReturnType<typeof app.listen> | undefined;
async function start() {
  await connectDatabase();
  server = app.listen(env.PORT, () => console.info(JSON.stringify({ level: 'info', event: 'server_started', port: env.PORT, environment: env.NODE_ENV })));
}
async function shutdown(signal: string) {
  console.info(JSON.stringify({ level: 'info', event: 'shutdown_started', signal }));
  if (server) server.close();
  await disconnectDatabase().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
start().catch(error => { console.error('Unable to start VHAGAR API. Verify environment and MongoDB connectivity.', error instanceof Error ? error.message : 'unknown error'); process.exit(1); });
