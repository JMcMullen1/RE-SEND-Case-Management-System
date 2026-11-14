import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './zip';

describe('CSV export', () => {
  it('quotes and escapes cells, and writes dates and structures readably', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
    expect(csvCell(new Date('2026-11-14T10:00:00Z'))).toBe(
      '2026-11-14T10:00:00.000Z',
    );
    expect(csvCell(['x', 'y'])).toBe('"[""x"",""y""]"');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('starts with a byte-order mark and a header row', () => {
    const csv = toCsv(['id', 'name'], [{ id: 1, name: 'Ann' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('id,name\r\n1,Ann\r\n');
  });
});
