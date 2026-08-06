import postgres from 'postgres';
import { env } from '../env';
import {
  assertSafeToMutate,
  dropMarker,
  FixtureRefusal,
  truncateAll,
} from './safety';

async function main(): Promise<void> {
  const sql = postgres(env.DATABASE_URL as string, { max: 1 });
  try {
    await assertSafeToMutate(sql);
    await truncateAll(sql);
    await dropMarker(sql);
    console.log('Fixtures cleared: every table is empty.');
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof FixtureRefusal) {
    console.error(`Refused: ${error.message}`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
