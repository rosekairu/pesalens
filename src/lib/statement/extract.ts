import { StatementError, type TextBit } from "./types";

/** The parts of pdf.js we use. Passed in so the same code runs in the browser and in tests. */
export type PdfJs = {
  getDocument: (src: { data: Uint8Array; password?: string; isEvalSupported?: boolean; verbosity?: number }) => { promise: Promise<PdfDoc>; destroy(): Promise<void> };
};
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage> };
type PdfPage = { getTextContent(): Promise<{ items: unknown[] }> };

/**
 * Reads the text of every page, with positions. Works entirely in memory: the file is
 * never sent anywhere. Throws needs-code / wrong-code for locked statements.
 */
export async function extractText(pdfjs: PdfJs, bytes: Uint8Array, password?: string, onPage?: (done: number, total: number) => void): Promise<TextBit[][]> {
  let doc: PdfDoc;
  // pdf.js may detach the buffer, so give it a copy and keep the original for a retry with a code.
  const task = pdfjs.getDocument({ data: bytes.slice(), password: password || undefined, isEvalSupported: false, verbosity: 0 });
  try {
    doc = await task.promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    await task.destroy().catch(() => {});
    if (err?.name === "PasswordException") throw new StatementError(err.code === 2 ? "wrong-code" : "needs-code");
    throw new StatementError("not-pdf");
  }
  const pages: TextBit[][] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const bits: TextBit[] = [];
      for (const it of content.items as { str?: string; transform?: number[]; width?: number }[]) {
        if (!it.str || !it.transform || !it.str.trim()) continue;
        bits.push({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 });
      }
      pages.push(bits);
      onPage?.(n, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
