import { describe, expect, test } from "vitest";
import { toCsv, type CsvColumn } from "./csv";

interface Row {
  name: string;
  price: number;
  note: string | null;
}

const COLUMNS: CsvColumn<Row>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Price", value: (r) => r.price },
  { header: "Note", value: (r) => r.note },
];

/** Strips the BOM so assertions read cleanly. */
const body = (csv: string) => csv.replace(/^\uFEFF/, "");

describe("toCsv", () => {
  test("writes a header row and one line per record", () => {
    const csv = body(toCsv([{ name: "Widget", price: 19.99, note: null }], COLUMNS));
    expect(csv).toBe("Name,Price,Note\r\nWidget,19.99,\r\n");
  });

  test("prices stay numeric, because a spreadsheet has to sum them", () => {
    const csv = body(toCsv([{ name: "A", price: 1234.56, note: null }], COLUMNS));
    // Not "$1,234.56". Formatted currency is a text column.
    expect(csv).toContain(",1234.56,");
  });

  test("a value containing a comma, a quote and a newline round-trips", () => {
    const csv = body(
      toCsv([{ name: 'Say "hi", now\nagain', price: 1, note: null }], COLUMNS),
    );
    expect(csv).toContain('"Say ""hi"", now\nagain"');
  });

  test("a leading equals is neutralised", () => {
    // Formula injection: =1+1 is evaluated by Excel, Sheets and LibreOffice.
    const csv = body(toCsv([{ name: "=1+1", price: 0, note: null }], COLUMNS));
    expect(csv).toContain("'=1+1");
  });

  test.each(["+1", "-1", "@SUM(A1)"])("a leading %s is neutralised too", (dangerous) => {
    const csv = body(toCsv([{ name: dangerous, price: 0, note: null }], COLUMNS));
    expect(csv).toContain(`'${dangerous}`);
  });

  test("null and undefined become empty cells, not the strings", () => {
    const csv = body(toCsv([{ name: "A", price: 1, note: null }], COLUMNS));
    expect(csv).not.toContain("null");
    expect(csv.trimEnd().endsWith(",")).toBe(true);
  });

  test("starts with a BOM so Excel reads it as UTF-8", () => {
    // Without it a £ arrives as Â£ on a Windows default codepage.
    expect(toCsv([], COLUMNS).startsWith("\uFEFF")).toBe(true);
  });

  test("an empty result still carries its header", () => {
    expect(body(toCsv([], COLUMNS))).toBe("Name,Price,Note\r\n");
  });
});
