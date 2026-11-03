import { extractText, type PdfJs } from "./extract";
import { balanceGaps, readPeriod, readRows } from "./layout";
import { analyse, type Report } from "./analyse";

/** Statement bytes in, report out. Nothing leaves the device. */
export async function readStatement(pdfjs: PdfJs, bytes: Uint8Array, code?: string, onPage?: (done: number, total: number) => void): Promise<Report> {
  const pages = await extractText(pdfjs, bytes, code, onPage);
  const rows = readRows(pages);
  const report = analyse(rows, readPeriod(pages));
  report.balanceGaps = balanceGaps(rows);
  return report;
}
