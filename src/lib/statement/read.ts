import { extractText, type PdfJs } from "./extract";
import { balanceGaps, readPeriod, readRows } from "./layout";
import { analyse, type Report } from "./analyse";
import { diagnose } from "./diagnostics";
import type { RawRow } from "./types";

export type Statement = { report: Report; rows: RawRow[]; period: [number, number] | null };

/** Statement bytes in, report out. Nothing leaves the device. */
export async function openStatement(pdfjs: PdfJs, bytes: Uint8Array, code?: string, onPage?: (done: number, total: number) => void): Promise<Statement> {
  const pages = await extractText(pdfjs, bytes, code, onPage);
  const rows = readRows(pages);
  const period = readPeriod(pages);
  const report = analyse(rows, period);
  report.balanceGaps = balanceGaps(rows);
  report.diagnostics = diagnose(rows);
  return { report, rows, period };
}

export async function readStatement(pdfjs: PdfJs, bytes: Uint8Array, code?: string, onPage?: (done: number, total: number) => void): Promise<Report> {
  return (await openStatement(pdfjs, bytes, code, onPage)).report;
}
