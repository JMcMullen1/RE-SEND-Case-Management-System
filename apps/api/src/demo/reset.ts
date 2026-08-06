import { provisionDemoAccounts } from '../auth/demo-accounts';
import { resetDemoData } from '../repositories/demo';
import { env } from '../env';

/**
 * `npm run demo:reset` — empty every case-data table back to a blank case list,
 * then re-provision the demo accounts. Refuses unless DEMO_MODE is on, so it can
 * never wipe a real deployment.
 */
async function main(): Promise<void> {
  if (!env.DEMO_MODE) {
    console.error('Refused: demo:reset only runs when DEMO_MODE=true.');
    process.exit(1);
  }
  if (env.NODE_ENV === 'production') {
    console.error('Refused: demo:reset never runs in production.');
    process.exit(1);
  }
  await resetDemoData();
  await provisionDemoAccounts();
  console.log('Demo reset: case list is empty; demo accounts re-provisioned.');
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
