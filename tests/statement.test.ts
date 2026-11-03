import { readFileSync } from "fs";
import { analyse as analyseRows } from "../src/lib/statement/analyse";
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
  let n = 0;
  const row = (paidIn: number, withdrawn: number, balance: number) => ({ receipt: `R${n}`, t: -(n++) * 60000, details: "", status: "COMPLETED", paidIn, withdrawn, balance });
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

describe("money in and out", () => {
  it("match the statement's own totals, with the Fuliza parts shown", async () => {
    const { extractText } = await import("../src/lib/statement/extract");
    const { readRows } = await import("../src/lib/statement/layout");
    const rows = readRows(await extractText(lib, bytes("public/sample-statement.pdf")));
    const r = await readStatement(lib, bytes("public/sample-statement.pdf"));
    expect(r.moneyIn).toBeCloseTo(rows.reduce((s, x) => s + x.paidIn, 0), 2);
    expect(r.moneyOut).toBeCloseTo(rows.reduce((s, x) => s + x.withdrawn, 0), 2);
    expect(r.fulizaIn).toBeCloseTo(r.fuliza!.borrowed, 2);
    expect(r.fulizaOut).toBeGreaterThan(0);
    expect(r.months.reduce((s, m) => s + m.in, 0)).toBeCloseTo(r.moneyIn, 2);
  });
});

describe("statements without phone numbers", () => {
  it("groups the people you send to by name", async () => {
    const r = await readStatement(lib, bytes("tests/fixtures/nophone.pdf"));
    expect(r.people.length).toBeGreaterThan(5);
    expect(r.people.every((p) => p.number === undefined)).toBe(true);
    expect(r.people.map((p) => p.name)).toContain("JOHN KAMAU");
    expect(r.regulars?.people.length).toBe(3);
    expect(r.diagnostics?.unknown).toHaveLength(0);
  });
});

describe("balance check groups", () => {
  const row = (receipt: string, t: number, paidIn: number, withdrawn: number, balance: number, details = "") => ({ receipt, t, details, status: "COMPLETED", paidIn, withdrawn, balance });
  it("accepts a Fuliza payment printed in any order with odd in-between balances", () => {
    // Newest first. Balance 100, buy 500 with 400 of Fuliza: the statement shows 0.00 on both lines.
    const rows = [
      row("B", 3000, 0, 500, 0, "Merchant Payment Fuliza M-Pesa to 1234567 - SHOP"),
      row("B", 3000, 400, 0, 0, "OverDraft of Credit Party"),
      row("A", 1000, 100, 0, 100, "Funds received from - 0712***678 JOHN"),
      row("Z", 0, 0, 0, 0, "start"),
    ];
    expect(balanceGaps(rows)).toBe(0);
  });
});

describe("one month at a time", () => {
  it("months add up to the whole statement, Fuliza charges included", async () => {
    const { openStatement } = await import("../src/lib/statement/read");
    const { analyse, monthWindow } = await import("../src/lib/statement/analyse");
    for (const f of ["public/sample-statement.pdf", "tests/fixtures/nophone.pdf"]) {
      const st = await openStatement(lib, bytes(f));
      const parts = st.report.months.map((m) => analyse(st.rows, st.period, monthWindow(m.key)));
      const sum = (k: (r: typeof st.report) => number) => parts.reduce((s, r) => s + k(r), 0);
      expect(sum((r) => r.fees.total)).toBeCloseTo(st.report.fees.total, 1);
      expect(sum((r) => r.fees.fuliza)).toBeCloseTo(st.report.fees.fuliza, 1);
      expect(sum((r) => r.moneyIn)).toBeCloseTo(st.report.moneyIn, 1);
      expect(sum((r) => r.fuliza?.borrowed ?? 0)).toBeCloseTo(st.report.fuliza!.borrowed, 1);
      expect(parts[3].period.months).toBe(1);
    }
  });
});

describe("Fuliza owed from before the statement", () => {
  // eslint-disable-next-line
  const day = 86_400_000, t0 = Date.UTC(2026, 0, 1, 9);
  const row = (receipt: string, t: number, details: string, paidIn: number, withdrawn: number) => ({ receipt, t, details, status: "COMPLETED", paidIn, withdrawn, balance: null });
  it("doesn't count repaying an older loan as a charge", () => {
    const rows = [
      row("A1", t0, "OverDraft of Credit Party", 100, 0),
      row("A2", t0 + 1000, "Merchant Payment Fuliza M-Pesa to 1234567 - SHOP", 0, 100),
      row("A3", t0 + day, "Business Payment from 501901 - EMPLOYER", 20000, 0),
      // Clears a 10,000 loan from December plus the 100 above.
      row("A4", t0 + day + 1000, "OD Loan Repayment to 232323 - M-PESA Overdraw", 0, 10105),
      row("B1", t0 + 40 * day, "OverDraft of Credit Party", 1000, 0),
      row("B2", t0 + 45 * day, "OD Loan Repayment to 232323 - M-PESA Overdraw", 0, 1060),
    ];
    const r = analyseRows(rows);
    // 25 at most for the first repayment (a normal fee on 100), then the full 60 on the second.
    expect(r.fees.fuliza).toBeLessThanOrEqual(110);
    expect(r.fees.fuliza).toBeGreaterThanOrEqual(60);
  });
});
