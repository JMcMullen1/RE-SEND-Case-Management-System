import readXlsxFile from 'read-excel-file/browser';

export interface SheetTable {
  name: string;
  headings: string[];
  rows: string[][];
  /** The spreadsheet row number of rows[0]. */
  firstRowNumber: number;
}

/** A cell as text: dates as YYYY-MM-DD, everything else as shown. */
function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return '';
    return cell.toISOString().slice(0, 10);
  }
  if (typeof cell === 'boolean') return cell ? 'Yes' : 'No';
  return String(cell).trim();
}

/**
 * Read every sheet of a workbook in the browser (the file never leaves the
 * computer). The heading row is the first with at least three filled cells.
 */
export async function readWorkbook(file: File): Promise<SheetTable[]> {
  const sheets = await readXlsxFile(file);
  return sheets.map(({ sheet, data }) => {
    const text = data.map((row) => row.map(cellText));
    const headerIndex = text.findIndex(
      (row) => row.filter(Boolean).length >= 3,
    );
    if (headerIndex < 0)
      return { name: sheet, headings: [], rows: [], firstRowNumber: 1 };
    const headings = text[headerIndex]!;
    // Keep blank rows in place, so every row keeps its own number (the
    // import skips blank rows); drop only those after the last filled row.
    const body = text.slice(headerIndex + 1);
    let last = body.length;
    while (last > 0 && !body[last - 1]!.some(Boolean)) last -= 1;
    return {
      name: sheet,
      headings,
      rows: body.slice(0, last).map((row) => row.slice(0, headings.length)),
      firstRowNumber: headerIndex + 2,
    };
  });
}
