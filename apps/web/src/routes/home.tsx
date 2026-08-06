import { PRODUCT_NAME, STRAPLINE } from '@re-send/shared';

export function HomePage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-resend-purple">
        {PRODUCT_NAME}
      </h1>
      <p className="text-resend-ink">{STRAPLINE}</p>
    </main>
  );
}
