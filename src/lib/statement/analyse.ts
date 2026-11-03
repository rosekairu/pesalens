import { classify } from "./classify";
import { defaultCategory } from "./categories";
import type { FeeType, RawRow, Txn } from "./types";
import type { Diagnostics } from "./diagnostics";

const DAY = 86_400_000;

export type Payee = { key: string; name: string; number?: string; account?: string; kind: Txn["kind"]; category: string; total: number; count: number };
/**
 * A payment that repeats. "monthly": about the same amount once a month. "most-months": paid in
 * most months, any number of times and amounts (amount is the typical month's total).
 * "every-few-months": a lump every couple of months, such as school fees (instalments count as one).
 */
export type Recurring = { key: string; name: string; number?: string; amount: number; rhythm: "monthly" | "most-months" | "every-few-months"; day?: number; count: number; monthsSeen: number; months: number; perMonth: number };
export type Person = { key: string; name: string; number?: string; total: number; count: number; fees: number };
export type Month = { key: string; label: string; in: number; out: number };

export type Report = {
  period: { start: number; end: number; months: number };
  count: number;
  fees: { total: number; byType: Record<FeeType, number>; fuliza: number; fulizaEstimated: boolean };
  fuliza: { borrowed: number; charges: number; times: number; daysOverdrawn: number; lateMonthShare: number } | null;
  /** Totals as the statement counts them: everything paid in and everything withdrawn. */
  moneyIn: number;
  moneyOut: number;
  /** The Fuliza parts of those totals. */
  fulizaIn: number;
  fulizaOut: number;
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

/** The first and last moment of a month key such as "2026-04". */
export function monthWindow(key: string): [number, number] {
  const [y, m] = key.split("-").map(Number);
  return [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1) - 1000];
}

/**
 * Builds everything the results page shows from the statement rows.
 * With a window (one month), every figure covers just that window. Fuliza charges are still
 * worked out across the whole statement, then counted in the month each repayment was made.
 */
export function analyse(rows: RawRow[], periodHint?: [number, number] | null, window?: [number, number]): Report {
  const allTxns = toTxns(rows);
  if (!allTxns.length) throw new Error("No transactions");
  const txns = window ? allTxns.filter((t) => t.t >= window[0] && t.t <= window[1]) : allTxns;
  const start = window ? Math.max(window[0], periodHint?.[0] ?? allTxns[0].t) : periodHint?.[0] ?? allTxns[0].t;
  const end = window ? Math.min(window[1], periodHint?.[1] ?? allTxns[allTxns.length - 1].t) : periodHint?.[1] ?? allTxns[allTxns.length - 1].t;
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
  // present. Otherwise each repayment is matched to the oldest borrowing still owed, and whatever it
  // pays beyond that borrowing is the charge. Repayments before the first borrowing in the statement
  // are for a loan taken before it started, so they aren't counted.
  const inWindow = (t: Txn) => txns.includes(t);
  const allDraws = allTxns.filter((t) => t.kind === "fuliza-draw");
  const allRepays = allTxns.filter((t) => t.kind === "fuliza-repay");
  const draws = allDraws.filter(inWindow);
  const repays = allRepays.filter(inWindow);
  const feeRows = txns.filter((t) => t.kind === "fuliza-fee");
  let fuliza: Report["fuliza"] = null;
  let fulizaCharges = 0;
  let fulizaEstimated = false;
  if (allDraws.length || allRepays.length || allTxns.some((t) => t.kind === "fuliza-fee")) {
    const borrowed = draws.reduce((s, t) => s + t.paidIn, 0);
    if (allTxns.some((t) => t.kind === "fuliza-fee")) {
      fulizaCharges = feeRows.reduce((s, t) => s + t.withdrawn, 0);
    } else if (allDraws.length) {
      const chargeOf = new Map<Txn, number>();
      let owedPrincipal = 0;
      const firstDraw = allDraws[0].t;
      for (const t of allTxns) {
        if (t.kind === "fuliza-draw") owedPrincipal += t.paidIn;
        if (t.kind !== "fuliza-repay") continue;
        if (t.t < firstDraw) { chargeOf.set(t, 0); continue; }
        const principal = Math.min(owedPrincipal, t.withdrawn);
        owedPrincipal -= principal;
        chargeOf.set(t, t.withdrawn - principal);
      }
      fulizaCharges = Math.round(repays.reduce((s, t) => s + (chargeOf.get(t) ?? 0), 0) * 100) / 100;
      fulizaEstimated = true;
    }
    // Days overdrawn: days in the period that end with Fuliza still owed (tracked across the whole statement).
    let owed = 0, days = 0;
    const events = [...allDraws.map((t) => ({ t: t.t, a: t.paidIn })), ...allRepays.map((t) => ({ t: t.t, a: -t.withdrawn }))].sort((a, b) => a.t - b.t);
    if (events.length) {
      let i = 0;
      for (let day = Math.floor(events[0].t / DAY); day <= Math.floor(end / DAY); day++) {
        while (i < events.length && Math.floor(events[i].t / DAY) <= day) owed = Math.max(0, owed + events[i++].a);
        if (owed > 0.5 && day >= Math.floor(start / DAY)) days++;
      }
    }
    const drawDays = new Set(draws.map((t) => Math.floor(t.t / DAY)));
    const late = draws.filter((t) => new Date(t.t).getUTCDate() >= 22).length;
    if (!window || draws.length || repays.length || fulizaCharges > 0) {
      fuliza = { borrowed, charges: fulizaCharges, times: drawDays.size, daysOverdrawn: days, lateMonthShare: draws.length ? late / draws.length : 0 };
    }
  }

  const feeTotal = Object.values(byType).reduce((a, b) => a + b, 0) + fulizaCharges;

  // Money in and out, counted the way the statement counts them, so the totals match it.
  // The Fuliza parts are reported separately so people can see how much was borrowing.
  const isIn = (t: Txn) => t.paidIn > 0 && ["received", "business-in", "deposit", "other"].includes(t.kind);
  const monthMap = new Map<string, Month>();
  for (let t = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), 1); t <= end; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) {
    monthMap.set(monthKey(t), { key: monthKey(t), label: MONTHS[new Date(t).getUTCMonth()], in: 0, out: 0 });
  }
  let moneyIn = 0, moneyOut = 0, fulizaIn = 0, fulizaOut = 0;
  for (const t of txns) {
    const m = monthMap.get(monthKey(t.t));
    moneyIn += t.paidIn;
    moneyOut += t.withdrawn;
    if (m) { m.in += t.paidIn; m.out += t.withdrawn; }
    if (t.kind === "fuliza-draw") fulizaIn += t.paidIn;
    if (t.kind === "fuliza-repay") fulizaOut += t.withdrawn;
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

  // Regular payments.
  const recurring: Recurring[] = [];
  const needMonths = Math.max(Math.min(3, months), Math.ceil(months * 0.6));
  for (const p of payees) {
    if (p.kind === "withdraw") continue;
    const ts = txns.filter((t) => t.key === p.key && t.withdrawn > 0);
    if (ts.length < 2) continue;
    const totals = new Map<string, number>();
    for (const t of ts) totals.set(monthKey(t.t), (totals.get(monthKey(t.t)) ?? 0) + t.withdrawn);
    const monthsSeen = totals.size;
    const base = { key: p.key, name: p.name, number: p.number, count: ts.length, monthsSeen, months };
    if (monthsSeen >= needMonths) {
      const typical = median(ts.map((t) => t.withdrawn));
      const similar = ts.filter((t) => Math.abs(t.withdrawn - typical) <= typical * 0.15);
      const perMonth = ts.length / monthsSeen;
      if (perMonth <= 1.5 && similar.length >= ts.length * 0.7) {
        recurring.push({ ...base, amount: typical, rhythm: "monthly", day: Math.round(median(similar.map((t) => new Date(t.t).getUTCDate()))), perMonth: typical });
      } else {
        const monthly = median([...totals.values()]);
        recurring.push({ ...base, amount: monthly, rhythm: "most-months", perMonth: monthly });
      }
      continue;
    }
    // Lumps every couple of months. Payments within 30 days of each other are one lump (instalments).
    const lumps: { t: number; total: number }[] = [];
    for (const t of ts) {
      const last = lumps[lumps.length - 1];
      if (last && t.t - last.t <= 30 * DAY) last.total += t.withdrawn;
      else lumps.push({ t: t.t, total: t.withdrawn });
    }
    const typicalLump = median(lumps.map((l) => l.total));
    if (lumps.length >= 2 && typicalLump >= 1000) {
      const gaps = lumps.slice(1).map((l, i) => (l.t - lumps[i].t) / DAY);
      const similarLumps = lumps.filter((l) => Math.abs(l.total - typicalLump) <= typicalLump * 0.35);
      if (gaps.every((g) => g >= 45 && g <= 150) && similarLumps.length >= lumps.length * 0.6) {
        recurring.push({ ...base, amount: typicalLump, rhythm: "every-few-months", perMonth: (typicalLump * lumps.length) / months });
      }
    }
  }
  // Biggest monthly cost first.
  recurring.sort((a, b) => b.perMonth - a.perMonth);

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
    .filter((p) => p.kind === "send")
    .map((p) => ({
      key: p.key, name: p.name, number: p.number, total: p.total, count: p.count,
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
    fulizaIn,
    fulizaOut,
    months: [...monthMap.values()],
    payees,
    recurring: recurring.slice(0, 8),
    income,
    people,
    regulars,
    tillPayments,
    biggestFee,
    balanceGaps: 0,
  };
}
