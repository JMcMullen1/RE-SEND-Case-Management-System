import { useEffect, useState } from 'react';
import { londonToday } from '@re-send/shared';

/**
 * Today's Europe/London civil date, recomputed on a timer and on tab focus so
 * a browser left open overnight never shows yesterday's countdowns.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => londonToday(new Date()));

  useEffect(() => {
    const tick = () => setToday(londonToday(new Date()));
    const interval = window.setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  return today;
}
