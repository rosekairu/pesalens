import type { RawRow } from "./types";
import { classify } from "./classify";

/**
 * Turns a Details line into its shape, with every digit and name masked, so someone can
 * share how their statement is laid out without sharing what's in it.
 * "Customer Transfer to 0712***678 - JOHN KAMAU" becomes "Customer Transfer to 9999***999 - NAME".
 */
export function maskDetails(details: string): string {
  let s = details.replace(/\d/g, "9");
  const dash = s.search(/\s-\s*|(?<=\d)-(?=\S)/);
  if (dash >= 0) {
    const acc = /\bAcc\./.test(s.slice(dash)) ? " Acc. ACCOUNT" : "";
    s = s.slice(0, dash) + " - NAME" + acc;
  }
  return s.replace(/\s+/g, " ").trim();
}

export type Diagnostics = {
  rows: number;
  kinds: Record<string, number>;
  cells: Record<string, number>;
  statuses: Record<string, number>;
  /** Shapes of lines PesaLens couldn't place, most common first. */
  unknown: { shape: string; count: number }[];
  /** A sample of every shape, so the layout can be checked. */
  shapes: { shape: string; kind: string; count: number }[];
};

export function diagnose(rows: RawRow[]): Diagnostics {
  const kinds: Record<string, number> = {}, cells: Record<string, number> = {}, statuses: Record<string, number> = {};
  const shapes = new Map<string, { kind: string; count: number }>();
  for (const r of rows) {
    const kind = classify(r.details, r.paidIn, r.withdrawn).kind;
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    cells[String(r.cells ?? "?")] = (cells[String(r.cells ?? "?")] ?? 0) + 1;
    const st = r.status || "(none)";
    statuses[st] = (statuses[st] ?? 0) + 1;
    const shape = maskDetails(r.details);
    const e = shapes.get(shape) ?? { kind, count: 0 };
    e.count++;
    shapes.set(shape, e);
  }
  const all = [...shapes.entries()].map(([shape, v]) => ({ shape, ...v })).sort((a, b) => b.count - a.count);
  return {
    rows: rows.length, kinds, cells, statuses,
    unknown: all.filter((x) => x.kind === "other").slice(0, 25).map(({ shape, count }) => ({ shape, count })),
    shapes: all.slice(0, 40),
  };
}

/** Plain text a person can copy and send. Contains no names, numbers or amounts. */
export function diagnosticsText(d: Diagnostics, gaps: number): string {
  const kv = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(", ");
  return [
    `PesaLens diagnostics (names, numbers and amounts removed)`,
    `Lines read: ${d.rows}`,
    `Balance mismatches: ${Math.round(gaps * 100)}%`,
    `Types: ${kv(d.kinds)}`,
    `Amount cells per line: ${kv(d.cells)}`,
    `Status values: ${kv(d.statuses)}`,
    ``,
    `Lines it couldn't recognise:`,
    ...(d.unknown.length ? d.unknown.map((x) => `  ${x.count} x ${x.shape}`) : ["  none"]),
    ``,
    `Most common line shapes:`,
    ...d.shapes.map((x) => `  ${x.count} x [${x.kind}] ${x.shape}`),
  ].join("\n");
}
