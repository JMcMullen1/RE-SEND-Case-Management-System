import { describe, expect, it, vi } from 'vitest';
import {
  addConnection,
  disconnectUser,
  removeConnection,
  setConnectionUser,
} from './realtime';

describe('disconnecting a leaver', () => {
  it("closes only that person's live connections", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const a = addConnection(() => {}, { close: closeA });
    const b = addConnection(() => {}, { close: closeB });
    setConnectionUser(a, 'leaver');
    setConnectionUser(b, 'colleague');
    expect(disconnectUser('leaver')).toBe(1);
    expect(closeA).toHaveBeenCalled();
    expect(closeB).not.toHaveBeenCalled();
    removeConnection(b);
  });
});
