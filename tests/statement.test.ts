import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { readStatement } from "../src/lib/statement/read";
import type { PdfJs } from "../src/lib/statement/extract";

const lib = pdfjs as unknown as PdfJs;
const bytes = (p: string) => new Uint8Array(readFileSync(p));

describe("reading a statement", () => {
  it("reads the sample statement", async () => {
    const r = await readStatement(lib, bytes("public/sample-statement.pdf"));
    expect(r.period.months).toBe(12);
    expect(r.count).toBeGreaterThan(1000);
    expect(r.fees.byType.send).toBeGreaterThan(0);
    expect(r.fees.byType.till).toBe(0);
    expect(r.fuliza?.borrowed).toBeGreaterThan(0);
    expect(r.income).toMatchObject({ amount: 68000, day: 27 });
    expect(r.recurring.map((x) => x.number)).toEqual(expect.arrayContaining(["522522", "247247", "150501"]));
    expect(r.regulars?.people).toHaveLength(3);
    expect(r.payees.find((p) => p.number === "247247")?.category).toBe("Rent");
    // Every charge was matched to a fee type, and money in/out are in the right range.
    expect(r.fees.total).toBeCloseTo(Object.values(r.fees.byType).reduce((a, b) => a + b, 0) + r.fees.fuliza, 2);
    expect(r.moneyIn).toBeGreaterThan(700000);
  });

  it("asks for the code on a locked statement, rejects a wrong one, opens with the right one", async () => {
    const locked = bytes("tests/fixtures/locked.pdf");
    await expect(readStatement(lib, locked)).rejects.toMatchObject({ code: "needs-code" });
    await expect(readStatement(lib, locked, "11111111")).rejects.toMatchObject({ code: "wrong-code" });
    const open = await readStatement(lib, locked, "48217365");
    const plain = await readStatement(lib, bytes("public/sample-statement.pdf"));
    expect(open.fees.total).toBe(plain.fees.total);
  });

  it("handles statements that print withdrawals as negative numbers", async () => {
    const r = await readStatement(lib, bytes("tests/fixtures/neg.pdf"));
    expect(r.fees.byType.send).toBeGreaterThan(0);
    expect(r.moneyOut).toBeGreaterThan(0);
  });

  it("refuses a PDF that isn't an M-PESA statement", async () => {
    await expect(readStatement(lib, bytes("tests/fixtures/other.pdf"))).rejects.toMatchObject({ code: "not-statement" });
  });

  it("refuses a file that isn't a PDF", async () => {
    await expect(readStatement(lib, new TextEncoder().encode("hello"))).rejects.toMatchObject({ code: "not-pdf" });
  });
});

import { balanceGaps } from "../src/lib/statement/layout";
describe("balance check", () => {
  const row = (paidIn: number, withdrawn: number, balance: number) => ({ receipt: "X", t: 0, details: "", status: "COMPLETED", paidIn, withdrawn, balance });
  it("is zero when every balance follows from the line before", () => {
    expect(balanceGaps([row(0, 100, 900), row(1000, 0, 1000), row(0, 0, 0)])).toBe(0);
  });
  it("notices a missing line", () => {
    // The 300 withdrawal between these two lines was lost.
    expect(balanceGaps([row(0, 100, 600), row(1000, 0, 1000)])).toBe(1);
  });
  it("finds no gaps in the sample statement", async () => {
    const { extractText } = await import("../src/lib/statement/extract");
    const { readRows } = await import("../src/lib/statement/layout");
    expect(balanceGaps(readRows(await extractText(lib, bytes("public/sample-statement.pdf"))))).toBe(0);
  });
});

describe("other statement layouts", () => {
  // Headings centred over columns, with empty amount cells: the layout that broke the first real statement.
  for (const f of ["tests/fixtures/centered.pdf", "tests/fixtures/oneline.pdf"]) {
    it(`reads ${f}`, async () => {
      const r = await readStatement(lib, bytes(f));
      expect(r.fees.byType.send).toBeGreaterThan(0);
      expect(r.fees.byType.other).toBe(0);
      expect(r.fuliza?.borrowed).toBeGreaterThan(0);
      expect(r.people.length).toBeGreaterThan(3);
      expect(r.balanceGaps).toBe(0);
      expect(r.diagnostics?.unknown).toHaveLength(0);
    });
  }
});

import { maskDetails } from "../src/lib/statement/diagnostics";
describe("diagnostics masking", () => {
  it("removes names and numbers", () => {
    expect(maskDetails("Customer Transfer to 0712***678 - JOHN KAMAU")).toBe("Customer Transfer to 9999***999 - NAME");
    expect(maskDetails("Pay Bill Online to 888880 - KPLC PREPAID Acc. 14104415022")).toBe("Pay Bill Online to 999999 - NAME Acc. ACCOUNT");
    expect(maskDetails("Merchant Payment Fuliza M-Pesa to7623398 - Muturi Shop")).toBe("Merchant Payment Fuliza M-Pesa to9999999 - NAME");
  });
});
