import { classify } from "./classify";
import { defaultCategory } from "./categories";
import type { FeeType, RawRow, Txn } from "./types";
import type { Diagnostics } from "./diagnostics";

const DAY = 86_400_000;

export type Payee = { key: string; name: string; number?: string; account?: string; kind: Txn["kind"]; category: string; total: number; count: number };
export type Recurring = { key: string; name: string; number?: string; amount: number; rhythm: "monthly" | "every-few-months"; day?: number; count: number };
export type Person = { key: string; name: string; number: string; total: number; count: number; fees: number };
export type Month = { key: string; label: string; in: number; out: number };

export type Report = {
  period: { start: number; end: number; months: number };
  count: number;
  fees: { total: number; byType: Record<FeeType, number>; fuliza: number; fulizaEstimated: boolean };
  fuliza: { borrowed: number; charges: number; times: number; daysOverdrawn: number; lateMonthShare: number } | null;
  moneyIn: number;
  moneyOut: number;
  months: Month[];
  payees: Payee[];
  recurring: Recurring[];
  income: { name: string; amount: number; day: number } | null;
  people: Person[];
  /** Up to three people paid most weeks, and what sending to them cost. */
  regulars: { people: Person[]; fees: number } | null;
  tillPayments: { count: number; fees: number };
  biggestFee: { type: FeeType | "fuliza"; amount: number; count: number } | null;
  /** Share of rows whose balance doesn't follow from the previous row. Above 5%, totals may be off. */
  balanceGaps: number;
  diagnostics?: Diagnostics;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const monthKey = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toTxns(rows: RawRow[]): Txn[] {
  return rows
    .filter((r) => !/FAIL|CANCEL|DECLIN|REVERS/i.test(r.status))
    .map((r) => ({ ...r, ...classify(r.details, r.paidIn, r.withdrawn) }))
    .sort((a, b) => a.t - b.t);
}

/** Builds everything the results page shows from the statement rows. */
export function analyse(rows: RawRow[], periodHint?: [number, number] | null): Report {
  const txns = toTxns(rows);
  if (!txns.length) throw new Error("No transactions");
  const start = periodHint?.[0] ?? txns[0].t;
  const end = periodHint?.[1] ?? txns[txns.length - 1].t;
  const months = Math.max(1, Math.round((end - start) / (30.44 * DAY)));
  const weeks = Math.max(1, (end - start) / (7 * DAY));

  // Charges are their own rows that share the receipt number of the payment they belong to.
  const chargeByReceipt = new Map<string, number>();
  const byType: Record<FeeType, number> = { send: 0, paybill: 0, till: 0, withdraw: 0, pochi: 0, other: 0 };
  const countByType: Record<FeeType, number> = { send: 0, paybill: 0, till: 0, withdraw: 0, pochi: 0, other: 0 };
  const parentKind = new Map<string, Txn["kind"]>();
  for (const t of txns) if (t.kind !== "charge" && t.kind !== "fuliza-draw") parentKind.set(t.receipt, t.kind);
  for (const t of txns) {
    if (t.kind !== "charge") continue;
    // Trust the payment the charge belongs to over the charge's own wording.
    const parent = parentKind.get(t.receipt);
    const type: FeeType = parent === "send" || parent === "paybill" || parent === "till" || parent === "withdraw" || parent === "pochi" ? parent : t.feeType ?? "other";
    byType[type] += t.withdrawn;
    countByType[type] += 1;
    chargeByReceipt.set(t.receipt, (chargeByReceipt.get(t.receipt) ?? 0) + t.withdrawn);
  }

  // Fuliza: the statement shows what was borrowed and what was repaid. Explicit fee rows are used when
  // present; otherwise the charges are what was repaid beyond what was borrowed.
  const draws = txns.filter((t) => t.kind === "fuliza-draw");
  const repays = txns.filter((t) => t.kind === "fuliza-repay");
  const feeRows = txns.filter((t) => t.kind === "fuliza-fee");
  let fuliza: Report["fuliza"] = null;
  let fulizaCharges = 0;
  let fulizaEstimated = false;
  if (draws.length || repays.length || feeRows.length) {
    const borrowed = draws.reduce((s, t) => s + t.paidIn, 0);
    if (feeRows.length) {
      fulizaCharges = feeRows.reduce((s, t) => s + t.withdrawn, 0);
    } else if (draws.length) {
      // Only count repayments after the first draw, and draws before the last repayment,
      // so a loan carried in from before the statement (or still open at the end) doesn't skew it.
      const first = draws[0].t, last = repays.length ? repays[repays.length - 1].t : 0;
      const repaid = repays.filter((t) => t.t >= first).reduce((s, t) => s + t.withdrawn, 0);
      const settled = draws.filter((t) => t.t <= last).reduce((s, t) => s + t.paidIn, 0);
      fulizaCharges = Math.max(0, Math.round((repaid - settled) * 100) / 100);
      fulizaEstimated = true;
    }
    // Days overdrawn: days that end with Fuliza still owed.
    let owed = 0, days = 0;
    const events = [...draws.map((t) => ({ t: t.t, a: t.paidIn })), ...repays.map((t) => ({ t: t.t, a: -t.withdrawn }))].sort((a, b) => a.t - b.t);
    if (events.length) {
      let i = 0;
      for (let day = Math.floor(events[0].t / DAY); day <= Math.floor(end / DAY); day++) {
        while (i < events.length && Math.floor(events[i].t / DAY) <= day) owed = Math.max(0, owed + events[i++].a);
        if (owed > 0.5) days++;
      }
    }
    const drawDays = new Set(draws.map((t) => Math.floor(t.t / DAY)));
    const late = draws.filter((t) => new Date(t.t).getUTCDate() >= 22).length;
    fuliza = { borrowed, charges: fulizaCharges, times: drawDays.size, daysOverdrawn: days, lateMonthShare: draws.length ? late / draws.length : 0 };
  }

  const feeTotal = Object.values(byType).reduce((a, b) => a + b, 0) + fulizaCharges;

  // Money in and out. Moving money to your own savings, Fuliza borrowing and repaying,
  // and reversals are left out so they don't count twice.
  const isIn = (t: Txn) => t.paidIn > 0 && ["received", "business-in", "deposit", "other"].includes(t.kind);
  const isOut = (t: Txn) => t.withdrawn > 0 && !["fuliza-repay", "savings-in", "reversal"].includes(t.kind);
  const monthMap = new Map<string, Month>();
  for (let t = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), 1); t <= end; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) {
    monthMap.set(monthKey(t), { key: monthKey(t), label: MONTHS[new Date(t).getUTCMonth()], in: 0, out: 0 });
  }
  let moneyIn = 0, moneyOut = 0;
  for (const t of txns) {
    const m = monthMap.get(monthKey(t.t));
    if (isIn(t)) { moneyIn += t.paidIn; if (m) m.in += t.paidIn; }
    if (isOut(t)) { moneyOut += t.withdrawn; if (m) m.out += t.withdrawn; }
  }

  // Payees: every party money went to, with a default category.
  const payeeMap = new Map<string, Payee>();
  for (const t of txns) {
    if (!t.key || t.withdrawn <= 0 || !["send", "pochi", "paybill", "till", "withdraw", "airtime", "savings-in"].includes(t.kind)) continue;
    const p = payeeMap.get(t.key) ?? { key: t.key, name: t.name ?? t.key, number: t.number, account: t.account, kind: t.kind, category: defaultCategory(t), total: 0, count: 0 };
    p.total += t.withdrawn;
    p.count += 1;
    payeeMap.set(t.key, p);
  }
  const payees = [...payeeMap.values()].sort((a, b) => b.total - a.total);

  // Regular payments: same payee, similar amount, in at least three months (or spaced a term apart).
  const recurring: Recurring[] = [];
  for (const p of payees) {
    if (p.kind === "airtime" || p.kind === "withdraw") continue;
    const ts = txns.filter((t) => t.key === p.key && t.withdrawn > 0);
    const typical = median(ts.map((t) => t.withdrawn));
    const similar = ts.filter((t) => Math.abs(t.withdrawn - typical) <= typical * 0.15);
    const monthsSeen = new Set(similar.map((t) => monthKey(t.t)));
    const perMonth = similar.length / Math.max(1, monthsSeen.size);
    if (monthsSeen.size >= Math.min(3, months) && monthsSeen.size >= months * 0.6 && perMonth <= 1.5) {
      recurring.push({ key: p.key, name: p.name, number: p.number, amount: typical, rhythm: "monthly", day: Math.round(median(similar.map((t) => new Date(t.t).getUTCDate()))), count: similar.length });
    } else if (similar.length >= 3 && typical >= 1000) {
      const gaps = similar.slice(1).map((t, i) => (t.t - similar[i].t) / DAY);
      if (gaps.every((g) => g >= 55 && g <= 140)) recurring.push({ key: p.key, name: p.name, number: p.number, amount: typical, rhythm: "every-few-months", count: similar.length });
    }
  }
  recurring.sort((a, b) => b.amount - a.amount);

  // Regular income: the same source paying in most months.
  let income: Report["income"] = null;
  const sources = new Map<string, Txn[]>();
  for (const t of txns) if (isIn(t) && t.key && t.kind === "business-in") sources.set(t.key, [...(sources.get(t.key) ?? []), t]);
  for (const ts of sources.values()) {
    const seen = new Set(ts.map((t) => monthKey(t.t)));
    if (seen.size >= Math.min(3, months)) {
      const amount = median(ts.map((t) => t.paidIn));
      if (!income || amount > income.amount) income = { name: ts[0].name ?? "", amount, day: Math.round(median(ts.map((t) => new Date(t.t).getUTCDate()))) };
    }
  }

  // People you send to most, with what it cost to send to them.
  const people: Person[] = payees
    .filter((p) => p.kind === "send" && p.number)
    .map((p) => ({
      key: p.key, name: p.name, number: p.number!, total: p.total, count: p.count,
      fees: txns.filter((t) => t.key === p.key).reduce((s, t) => s + (chargeByReceipt.get(t.receipt) ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total);

  const weekly = people.filter((p) => {
    const ws = new Set(txns.filter((t) => t.key === p.key).map((t) => Math.floor(t.t / (7 * DAY))));
    return ws.size >= weeks * 0.6;
  }).sort((a, b) => b.count - a.count).slice(0, 3);
  const regulars = weekly.length ? { people: weekly, fees: weekly.reduce((s, p) => s + p.fees, 0) } : null;

  const tills = txns.filter((t) => t.kind === "till");
  const tillPayments = { count: tills.length, fees: byType.till };

  const candidates: NonNullable<Report["biggestFee"]>[] = (Object.keys(byType) as FeeType[]).map((k) => ({ type: k, amount: byType[k], count: countByType[k] }));
  if (fuliza) candidates.push({ type: "fuliza", amount: fulizaCharges, count: fuliza.times });
  const biggest = candidates.sort((a, b) => b.amount - a.amount)[0];
  const sendCount = txns.filter((t) => t.kind === "send").length;
  const biggestFee = biggest && biggest.amount > 0 ? { ...biggest, count: biggest.type === "send" ? sendCount : biggest.count } : null;

  return {
    period: { start, end, months },
    count: txns.length,
    fees: { total: feeTotal, byType, fuliza: fulizaCharges, fulizaEstimated },
    fuliza,
    moneyIn,
    moneyOut,
    months: [...monthMap.values()],
    payees,
    recurring: recurring.slice(0, 6),
    income,
    people,
    regulars,
    tillPayments,
    biggestFee,
    balanceGaps: 0,
  };
}
