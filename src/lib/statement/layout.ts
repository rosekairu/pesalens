import { StatementError, type RawRow, type TextBit } from "./types";

type Line = { y: number; bits: TextBit[] };
type Cols = { time: number; details: number; status: number; nums: { key: "paidIn" | "withdrawn" | "balance"; right: number }[] };

const RECEIPT = /^[A-Z0-9]{8,12}$/;
const AMOUNT = /^-?[\d,]+\.\d{2}$/;
const DATE = /(\d{4})-(\d{2})-(\d{2})(?:\s*(\d{2}):(\d{2}):(\d{2}))?/;

/**
 * Splits text items into single words with estimated positions. PDFs group text differently
 * (one statement may print "Completion Time Details" as one item), so columns are found per word.
 */
export function toWords(bits: TextBit[]): TextBit[] {
  const out: TextBit[] = [];
  for (const b of bits) {
    const len = b.s.length || 1;
    for (const m of b.s.matchAll(/\S+/g)) {
      out.push({ s: m[0], x: b.x + (b.w * (m.index ?? 0)) / len, y: b.y, w: (b.w * m[0].length) / len });
    }
  }
  return out;
}

/** Groups words into visual lines, top to bottom, left to right. */
export function toLines(bits: TextBit[]): Line[] {
  const sorted = toWords(bits).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const b of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - b.y) <= 2.5) last.bits.push(b);
    else lines.push({ y: b.y, bits: [b] });
  }
  for (const l of lines) l.bits.sort((a, b) => a.x - b.x);
  return lines;
}

const lineText = (l: Line) => l.bits.map((b) => b.s).join(" ").replace(/\s+/g, " ").trim();

/** Finds the detailed table's header line and works out where each column sits. */
function findHeader(lines: Line[]): { index: number; cols: Cols } | null {
  for (let i = 0; i < lines.length; i++) {
    const bits = lines[i].bits;
    const find = (re: RegExp) => bits.find((b) => re.test(b.s));
    const receipt = find(/^receipt/i), time = find(/^completion/i), details = find(/^details/i);
    const status = find(/^transaction$/i) ?? find(/^status$/i);
    const paid = find(/^paid(in)?$/i), withdrawn = find(/^withdrawn$/i), balance = find(/^balance$/i);
    if (!receipt || !time || !details || !paid || !withdrawn || !balance) continue;
    // "Paid in" is usually two words; its right edge is the end of "in".
    const inWord = bits.find((b) => b.x > paid.x && /^in$/i.test(b.s) && b.x - (paid.x + paid.w) < 12);
    const paidIn = inWord ? { ...paid, w: inWord.x + inWord.w - paid.x } : paid;
    return {
      index: i,
      cols: {
        time: time.x - 4,
        details: details.x - 4,
        status: (status ?? paidIn).x - 4,
        nums: [
          { key: "paidIn", right: paidIn.x + paidIn.w },
          { key: "withdrawn", right: withdrawn.x + withdrawn.w },
          { key: "balance", right: balance.x + balance.w },
        ],
      },
    };
  }
  return null;
}

function parseAmount(s: string): number {
  return Math.abs(Number(s.replace(/,/g, "")));
}

function parseTime(s: string): number | null {
  const m = DATE.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", se = "0"] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
}

/** Reads the "Statement Period" line, if present, as [start, end]. */
export function readPeriod(pages: TextBit[][]): [number, number] | null {
  for (const l of toLines(pages[0] ?? [])) {
    const text = lineText(l);
    if (!/statement period/i.test(text)) continue;
    const m = /(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2})\s+(\d{4})\s*-\s*(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2})\s+(\d{4})/i.exec(text);
    if (m) return [Date.UTC(+m[3], +m[2] - 1, +m[1]), Date.UTC(+m[6], +m[5] - 1, +m[4], 23, 59, 59)];
  }
  return null;
}

/** Turns the pages of a full M-PESA statement into raw table rows (newest first, as printed). */
export function readRows(pages: TextBit[][]): RawRow[] {
  const all = pages.flat().map((b) => b.s).join(" ");
  if (!/M-?PESA/i.test(all)) throw new StatementError("not-statement");

  const rows: RawRow[] = [];
  let cols: Cols | null = null;
  let timeText = "";

  const finish = () => {
    const r = rows[rows.length - 1];
    if (r && Number.isNaN(r.t)) r.t = parseTime(timeText) ?? NaN;
  };

  for (const bits of pages) {
    const lines = toLines(bits);
    const header = findHeader(lines);
    if (header) cols = header.cols;
    if (!cols) continue;
    const c = cols;
    let prevY: number | null = null;
    let open = false;   // whether the current row can still take wrapped lines

    for (let i = header ? header.index + 1 : 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = { receipt: [] as string[], time: [] as string[], details: [] as string[], status: [] as string[] };
      const nums: Partial<Record<"paidIn" | "withdrawn" | "balance", number>> = {};
      for (const b of line.bits) {
        const s = b.s.trim();
        if (b.x >= c.status && AMOUNT.test(s)) {
          const right = b.x + b.w;
          const nearest = c.nums.reduce((p, q) => (Math.abs(q.right - right) < Math.abs(p.right - right) ? q : p));
          nums[nearest.key] = Number(s.replace(/,/g, ""));
        } else if (b.x < c.details && /^(\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}(:\d{2})?)$/.test(s)) parts.time.push(s);
        else if (/^(COMPLETED|FAILED|CANCELLED|DECLINED|PENDING|REVERSED)$/i.test(s) && b.x > c.details) parts.status.push(s);
        else if (b.x < c.time) parts.receipt.push(s);
        else if (b.x < c.details) parts.time.push(s);
        else if (b.x < c.status) parts.details.push(s);
        else parts.status.push(s);
      }
      const receipt = parts.receipt.join("");
      if (RECEIPT.test(receipt) && (nums.paidIn !== undefined || nums.withdrawn !== undefined)) {
        finish();
        timeText = parts.time.join(" ");
        rows.push({
          receipt,
          t: NaN,
          details: parts.details.join(" "),
          status: parts.status.join(" ").toUpperCase(),
          paidIn: Math.abs(nums.paidIn ?? 0),
          withdrawn: Math.abs(nums.withdrawn ?? 0),
          balance: nums.balance ?? null,
        });
        open = true;
        prevY = line.y;
        continue;
      }
      // A wrapped line: no receipt, no amounts, close below the row it belongs to.
      const wrapped = open && prevY !== null && prevY - line.y < 16 && !parts.receipt.length && Object.keys(nums).length === 0 && !parts.status.length;
      if (wrapped) {
        const r = rows[rows.length - 1];
        if (parts.details.length) r.details += " " + parts.details.join(" ");
        if (parts.time.length) timeText += " " + parts.time.join(" ");
        prevY = line.y;
      } else {
        open = false;
      }
    }
  }
  finish();

  if (!cols) throw new StatementError("unsupported-layout", "No detailed table header found");
  for (const r of rows) r.details = r.details.replace(/\s+/g, " ").trim();
  const good = rows.filter((r) => !Number.isNaN(r.t));
  if (good.length === 0 || good.length < rows.length * 0.9) throw new StatementError("unsupported-layout", "Could not read dates");
  return good;
}

/**
 * Share of rows whose balance doesn't follow from the row before it. A high share means
 * rows were missed or misread, so the results would be wrong. Rows are newest first.
 */
export function balanceGaps(rows: RawRow[]): number {
  let checked = 0, gaps = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const r = rows[i], older = rows[i + 1];
    if (r.balance === null || older.balance === null) continue;
    checked++;
    if (Math.abs(older.balance + r.paidIn - r.withdrawn - r.balance) > 0.5) gaps++;
  }
  return checked ? gaps / checked : 0;
}

export { parseAmount };
