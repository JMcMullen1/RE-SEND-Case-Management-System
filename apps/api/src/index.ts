import { buildServer } from './server';
import { env } from './env';

const app = buildServer();

app.listen({ port: env.PORT, host: env.HOST }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
