import { buildServer } from './server';
import { startEntityListener } from './entity-listener';
import { env } from './env';

async function main(): Promise<void> {
  const app = await buildServer();
  const stopListener = await startEntityListener();
  const shutdown = () => {
    void stopListener();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
