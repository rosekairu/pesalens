"use client";
import { createContext, useCallback, useContext, useState } from "react";
import type { Report } from "./statement/analyse";
import { StatementError } from "./statement/types";
import type { PdfJs } from "./statement/extract";

type Source = "sample" | "own";
type Ctx = {
  report: Report | null;
  source: Source | null;
  read: (bytes: Uint8Array, code: string | undefined, source: Source, onPage?: (done: number, total: number) => void) => Promise<Report>;
  close: () => void;
};

const StatementCtx = createContext<Ctx | null>(null);

let pdfjsPromise: Promise<PdfJs> | null = null;
/** Loads pdf.js only when a statement is opened. Its worker is served from this site. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m as unknown as PdfJs;
  });
  return pdfjsPromise;
}

/**
 * Holds the open statement's results in memory only. Nothing is written to storage,
 * so closing or refreshing the tab clears it.
 */
export function StatementProvider({ children }: { children: React.ReactNode }) {
  const [report, setReport] = useState<Report | null>(null);
  const [source, setSource] = useState<Source | null>(null);

  const read = useCallback<Ctx["read"]>(async (bytes, code, src, onPage) => {
    const [pdfjs, { readStatement }] = await Promise.all([loadPdfJs(), import("./statement/read")]);
    const r = await readStatement(pdfjs, bytes, code, onPage);
    setReport(r);
    setSource(src);
    return r;
  }, []);

  const close = useCallback(() => {
    setReport(null);
    setSource(null);
  }, []);

  return <StatementCtx.Provider value={{ report, source, read, close }}>{children}</StatementCtx.Provider>;
}

export function useStatement() {
  const c = useContext(StatementCtx);
  if (!c) throw new Error("useStatement needs StatementProvider");
  return c;
}

export { StatementError };
