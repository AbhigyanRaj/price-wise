/**
 * CSV generation.
 *
 * Two rules drive every decision here.
 *
 * Export values, not presentation. A column of "$1,234.56" is a text column
 * nobody can sum, and an analyst exporting to a spreadsheet wants to sum it.
 * So prices go out as raw numbers and dates as ISO strings, and the formatting
 * that belongs on screen stays on screen.
 *
 * A CSV is executable input to a spreadsheet. A cell beginning =, +, - or @ is
 * a formula in Excel, Sheets and LibreOffice, which is a real and frequently
 * exploited injection path when the data came from users. Every such value is
 * neutralised on the way out.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** RFC 4180: quote when the value contains a delimiter, a quote or a newline,
 *  and escape an embedded quote by doubling it. */
function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";

  let value = String(raw);

  // Formula injection. The leading apostrophe is what every spreadsheet reads
  // as "treat the rest as text".
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;

  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((column) => escapeCell(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCell(column.value(row))).join(",")),
  ];

  // CRLF per the RFC, and a BOM so Excel reads it as UTF-8 rather than as the
  // local codepage, which is what turns a £ into a Â£.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Hands the file to the browser. Separated from toCsv so the generation is a
 *  pure function that can be tested without a DOM. */
export function downloadCsv(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  // Without this the blob is held for the lifetime of the document.
  URL.revokeObjectURL(url);
}
