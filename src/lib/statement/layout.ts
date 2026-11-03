import { StatementError, type RawRow, type TextBit } from "./types";

type Line = { y: number; bits: TextBit[] };
type NumKey = "paidIn" | "withdrawn" | "balance";
type Cols = { details: number; nums: { key: NumKey; center: number }[] };

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
    const paid = find(/^paid(in)?$/i), withdrawn = find(/^withdrawn$/i), balance = find(/^balance$/i);
    if (!receipt || !time || !details || !paid || !withdrawn || !balance) continue;
    // "Paid in" is usually two words; its right edge is the end of "in".
    const inWord = bits.find((b) => b.x > paid.x && /^in$/i.test(b.s) && b.x - (paid.x + paid.w) < 12);
    const paidIn = inWord ? { ...paid, w: inWord.x + inWord.w - paid.x } : paid;
    return {
      index: i,
      cols: {
        details: details.x,
        nums: [
          { key: "paidIn", center: paidIn.x + paidIn.w / 2 },
          { key: "withdrawn", center: withdrawn.x + withdrawn.w / 2 },
          { key: "balance", center: balance.x + balance.w / 2 },
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

const TIME = /^(\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}(:\d{2})?)$/;
const STATUS = /^(COMPLETED|FAILED|CANCELLED|DECLINED|PENDING|REVERSED|SUCCESS(FUL)?)$/i;

/**
 * Splits one line into its parts by what each word looks like, not only where it sits.
 * Statements differ in how headings line up with their columns (left-aligned, centred),
 * so positions are only used where shapes can't decide (which amount column a number is in).
 */
export function readLine(line: Line, c: Cols) {
  const words = line.bits;
  // Amounts are the run of numbers at the end of the line.
  let tail = words.length;
  while (tail > 0 && AMOUNT.test(words[tail - 1].s)) tail--;
  const amountWords = words.slice(tail);
  const nums: Partial<Record<NumKey, number>> = {};
  const value = (w: TextBit) => Number(w.s.replace(/,/g, ""));
  if (amountWords.length >= 3) {
    const [a, b, bal] = amountWords.slice(-3);
    nums.paidIn = value(a); nums.withdrawn = value(b); nums.balance = value(bal);
  } else {
    // Empty cells: place each number in the amount column whose heading it sits nearest.
    for (const w of amountWords) {
      const mid = w.x + w.w / 2;
      const nearest = c.nums.reduce((p, q) => (Math.abs(q.center - mid) < Math.abs(p.center - mid) ? q : p));
      nums[nearest.key] = value(w);
    }
  }

  let receipt = "";
  const time: string[] = [], details: string[] = [], status: string[] = [];
  words.slice(0, tail).forEach((w, k) => {
    const s = w.s;
    if (k === 0 && RECEIPT.test(s) && w.x < c.details) receipt = s;
    else if (!details.length && TIME.test(s)) time.push(s);
    else if (STATUS.test(s)) status.push(s);
    else details.push(s);
  });
  return { receipt, time, details, status, nums, amounts: amountWords.length > 0, amountCount: amountWords.length };
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
    // Wrapped lines sit about one line-height below; allow a little more than the tightest spacing on the page.
    const gaps = lines.slice(1).map((l, k) => lines[k].y - l.y).filter((g) => g > 1).sort((a, b) => a - b);
    const gapLimit = Math.max(16, (gaps[0] ?? 10) * 1.8);

    for (let i = header ? header.index + 1 : 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = readLine(line, c);
      if (parts.receipt && parts.amounts) {
        finish();
        timeText = parts.time.join(" ");
        rows.push({
          receipt: parts.receipt,
          t: NaN,
          details: parts.details.join(" "),
          status: parts.status.join(" ").toUpperCase(),
          paidIn: Math.abs(parts.nums.paidIn ?? 0),
          withdrawn: Math.abs(parts.nums.withdrawn ?? 0),
          balance: parts.nums.balance ?? null,
          cells: parts.amountCount,
        });
        open = true;
        prevY = line.y;
        continue;
      }
      // A wrapped line: no receipt, no amounts, close below the row it belongs to.
      const wrapped = open && prevY !== null && prevY - line.y < gapLimit && !parts.receipt && !parts.amounts && !parts.status.length && (parts.details.length > 0 || parts.time.length > 0);
      if (wrapped && /^Disclaimer/i.test(parts.details[0] ?? "")) { open = false; continue; }
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
  for (const r of rows) r.details = r.details.replace(/\s*Disclaimer:.*$/i, "").replace(/\s+/g, " ").trim();
  const good = rows.filter((r) => !Number.isNaN(r.t));
  if (good.length === 0 || good.length < rows.length * 0.9) throw new StatementError("unsupported-layout", "Could not read dates");
  return good;
}

/**
 * Share of rows whose balance doesn't follow from the row before it. A high share means
 * rows were missed or misread, so the results would be wrong. Rows are newest first.
 */
/**
 * Share of transactions whose balance doesn't follow from the one before. A payment, its
 * charge and any Fuliza line share a receipt number and time, and statements print them in
 * varying order with in-between balances that don't chain, so each such group is checked as
 * a whole: the balance before, plus what came in, minus what went out, must equal one of the
 * balances printed in the group. A high share means lines were missed or misread.
 */
export function balanceGaps(rows: RawRow[]): number {
  const rate = (chrono: RawRow[]) => {
    const groups: RawRow[][] = [];
    for (const r of chrono) {
      const g = groups[groups.length - 1];
      if (g && (g[0].receipt === r.receipt || Math.abs(g[g.length - 1].t - r.t) <= 2000)) g.push(r);
      else groups.push([r]);
    }
    let checked = 0, gaps = 0;
    let before: number | null = null;
    for (const g of groups) {
      const printed = g.map((r) => r.balance).filter((b): b is number => b !== null);
      if (!printed.length) continue;
      const net = g.reduce((s, r) => s + r.paidIn - r.withdrawn, 0);
      if (before !== null) {
        checked++;
        const expected: number = before + net;
        if (printed.some((b) => Math.abs(b - expected) <= 0.5)) { before = expected; continue; }
        gaps++;
      }
      // Start again from the balance the statement printed last in the group.
      before = printed[printed.length - 1];
    }
    return checked ? gaps / checked : 0;
  };
  // Rows come newest first; try both orders in case a statement lists oldest first.
  return Math.min(rate([...rows].reverse()), rate(rows));
}

export { parseAmount };
