import { describe, expect, it } from 'vitest';
import { csvCell, safeSegment, toCsv, uniquePath, withSuffix } from './zip';

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

  it('defuses text a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe(
      '"\'=HYPERLINK(""http://x"",""click"")"',
    );
    expect(csvCell('+44 7700 900000')).toBe("'+44 7700 900000");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5'); // numbers stay numbers
  });

  it('starts with a byte-order mark and a header row', () => {
    const csv = toCsv(['id', 'name'], [{ id: 1, name: 'Ann' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('id,name\r\n1,Ann\r\n');
  });
});

describe('archive paths', () => {
  it('never lets a name climb out of its folder', () => {
    expect(safeSegment('..')).toBe('file');
    expect(safeSegment('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(safeSegment('a\u0001b')).toBe('a_b');
  });
  it('keeps extensions when adding suffixes, and dedupes without case', () => {
    expect(withSuffix('report.pdf', ' (v2)')).toBe('report (v2).pdf');
    const used = new Set<string>();
    expect(uniquePath('d', 'Report.pdf', used)).toBe('d/Report.pdf');
    expect(uniquePath('d', 'report.pdf', used)).toBe('d/report [2].pdf');
  });
});
