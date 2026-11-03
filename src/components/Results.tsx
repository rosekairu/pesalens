"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStatement } from "@/lib/StatementContext";
import { analyse, monthWindow, type Report } from "@/lib/statement/analyse";
import type { RawRow } from "@/lib/statement/types";
import type { FeeType } from "@/lib/statement/types";
import { ksh, longDate, maskName, num, ordinal, titleCase } from "@/lib/format";
import { diagnosticsText } from "@/lib/statement/diagnostics";
import { Footer, Header } from "./Header";
import { SampleButton } from "./SampleButton";

const FEE_LABELS: Record<FeeType | "fuliza", string> = {
  send: "Sending to people", withdraw: "Withdrawing cash", paybill: "Paybill", till: "Till payments", pochi: "Pochi la Biashara", other: "Other charges", fuliza: "Fuliza charges",
};
const FEE_COLOURS: Record<FeeType | "fuliza", string> = {
  send: "var(--lost)", withdraw: "var(--lost-2)", paybill: "var(--lost-3)", till: "#c98d8f", pochi: "#d9a3a5", other: "#b9c3d3", fuliza: "var(--fuliza)",
};
const COUNT_NOUN: Record<FeeType | "fuliza", string> = { send: "sends", withdraw: "withdrawals", paybill: "Paybill payments", till: "Till payments", pochi: "Pochi payments", other: "charges", fuliza: "times" };

export function Results() {
  const { report, rows, period, source, close } = useStatement();
  const router = useRouter();
  if (!report) {
    return (
      <>
        <Header />
        <main className="empty">
          <h1>No statement is open</h1>
          <p className="muted">Results are kept only while the page is open, so refreshing or closing it clears them. Open your statement again, or try the sample.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <Link href="/open" className="btn btn-primary">Open my statement</Link>
            <SampleButton className="btn" />
          </div>
        </main>
      </>
    );
  }
  return (
    <>
      <header className="results-head">
        <Link href="/" className="logo">pesalens</Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <span className="note">Read on this device. Nothing uploaded.</span>
          <button className="btn btn-sm" onClick={() => { close(); router.push("/"); }}>Close statement</button>
        </div>
      </header>
      <ReportView whole={report} rows={rows ?? []} period={period} sample={source === "sample"} />
      <Footer />
    </>
  );
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-04" → "April" (or "April 2026" with the year). */
const monthName = (key: string, withYear = false) => {
  const [y, m] = key.split("-").map(Number);
  return withYear ? `${MONTH_NAMES[m - 1]} ${y}` : MONTH_NAMES[m - 1];
};

function headline(r: Report, month: string | null, hasFuliza: boolean) {
  const what = hasFuliza ? "M-Pesa transaction fees and Fuliza charges" : "M-Pesa transaction fees";
  const when = month ? `in ${monthName(month, true)}` : r.period.months >= 11 ? "this year" : r.period.months <= 1 ? "this month" : `in these ${r.period.months} months`;
  return `${what} cost you ${ksh(r.fees.total)} ${when}.`;
}

function ReportView({ whole, rows, period, sample }: { whole: Report; rows: RawRow[]; period: [number, number] | null; sample: boolean }) {
  const [month, setMonth] = useState<string | null>(null);
  // Category moves apply to every month, so they live here rather than in the list.
  const [moves, setMoves] = useState<Record<string, string>>({});
  const r = useMemo(() => (month && rows.length ? analyse(rows, period, monthWindow(month)) : whole), [month, rows, period, whole]);
  const inMonth = month ? ` in ${monthName(month)}` : "";
  const average = whole.fees.total / Math.max(1, whole.period.months);
  const feeParts = ((["send", "withdraw", "paybill", "till", "pochi", "other"] as FeeType[]).map((k) => ({ k: k as FeeType | "fuliza", v: r.fees.byType[k] })))
    .concat(whole.fuliza ? [{ k: "fuliza", v: r.fees.fuliza }] : [])
    .filter((p) => p.v > 0 || p.k === "send" || p.k === "fuliza");
  const showPicker = whole.months.length > 1 && rows.length > 0;
  return (
    <main className="results">
      <p className="muted">{sample ? "Sample statement" : "Your statement"}, {longDate(whole.period.start)} to {longDate(whole.period.end)}, {num(whole.count)} transactions</p>
      {showPicker && <MonthPicker months={whole.months} month={month} onPick={setMonth} />}
      <h1>{headline(r, month, !!whole.fuliza)}</h1>
      {showPicker && <p className="vs">{month ? compare(r.fees.total, average) : `About ${ksh(average)} a month on average.`}</p>}
      {whole.balanceGaps > 0.05 && (
        <div className="error" role="note" style={{ maxWidth: 720 }}>
          <p>Some lines of this statement may not have been read correctly.</p>
          <p>The running balance doesn&apos;t add up on {Math.round(whole.balanceGaps * 100)}% of lines, so treat the totals as close, not exact.</p>
        </div>
      )}

      <section className="two" aria-label="Fees">
        <div>
          <div className="feebar" role="img" aria-label={feeParts.map((p) => `${FEE_LABELS[p.k]} ${ksh(p.v)}`).join(", ")}>
            {feeParts.map((p) => <span key={p.k} style={{ width: `${r.fees.total ? (p.v / r.fees.total) * 100 : 0}%`, background: FEE_COLOURS[p.k] }} />)}
          </div>
          <div className="fee-legend">
            {feeParts.map((p) => (
              <div key={p.k}><p><i style={{ background: FEE_COLOURS[p.k] }} />{FEE_LABELS[p.k]}</p><p>{num(p.v)}</p></div>
            ))}
          </div>
          {r.tillPayments.count > 0 && r.tillPayments.fees === 0 && (
            <p className="small muted" style={{ marginTop: 14 }}>Paying by Till cost you nothing: {num(r.tillPayments.count)} payments, no fees.</p>
          )}
        </div>
        <Drivers r={r} inMonth={inMonth} />
      </section>

      <section className="two flip section">
        <Fuliza r={r} inMonth={inMonth} month={month} />
        <Months whole={whole} view={r} month={month} onPick={setMonth} />
      </section>

      <Categories r={r} inMonth={inMonth} moves={moves} setMoves={setMoves} />

      <section className="two even section">
        <div>
          <h2>Regular payments</h2>
          {month && <p className="small muted" style={{ margin: "-4px 0 10px" }}>Spotting regular payments takes several months, so this always covers the whole statement.</p>}
          {whole.recurring.length ? whole.recurring.map((x) => (
            <div className="list-row" key={x.key}>
              <span><b>{x.key.startsWith("phone") || x.key.startsWith("pochi") ? maskName(x.name) : payeeLabel(x.name, x.number, x.key)}</b><br /><span className="small muted">{x.rhythm === "monthly" ? `Every month, around the ${ordinal(x.day ?? 1)}` : "Every few months"}</span></span>
              <span className="amt">{ksh(x.amount)}</span>
            </div>
          )) : <p className="muted">No payments repeat often enough to call regular.</p>}
        </div>
        <People r={r} month={month} />
      </section>

      {!sample && <Diagnose r={whole} />}
    </main>
  );
}

function compare(total: number, average: number) {
  const diff = total - average;
  if (Math.abs(diff) < Math.max(50, average * 0.05)) return `About the same as your average month (${ksh(average)}).`;
  return `That's ${ksh(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than your average month (${ksh(average)}).`;
}

function MonthPicker({ months, month, onPick }: { months: Report["months"]; month: string | null; onPick: (m: string | null) => void }) {
  const picked = useRef<HTMLButtonElement>(null);
  useEffect(() => { picked.current?.scrollIntoView({ inline: "center", block: "nearest" }); }, [month]);
  const chip = (key: string | null, label: string) => (
    <button key={key ?? "all"} ref={key === month ? picked : undefined} className="chip" aria-pressed={key === month} onClick={() => onPick(key)}>{label}</button>
  );
  return (
    <div className="month-picker" role="group" aria-label="Show results for">
      {chip(null, "Whole statement")}
      {months.map((m) => chip(m.key, m.label))}
    </div>
  );
}

function payeeLabel(name: string, number?: string, key?: string) {
  const n = titleCase(name);
  if (key?.startsWith("paybill:")) {
    const acc = key.split(":")[2];
    return `${n}, Paybill ${number}${acc ? `, Acc. ${acc}` : ""}`;
  }
  if (key?.startsWith("till:")) return `${n}, Till ${number}`;
  if (key?.startsWith("phone:") && number) return `${n}, ${number}`;
  return n;
}

function Drivers({ r, inMonth }: { r: Report; inMonth: string }) {
  const b = r.biggestFee;
  return (
    <div className="card">
      <h2>What drove the fees{inMonth}</h2>
      {b ? (
        <p><b>{FEE_LABELS[b.type]} {b.type === "fuliza" ? "were" : "was"} your biggest fee:</b> {ksh(b.amount)} {b.type === "fuliza" ? `over ${num(b.count)} ${b.count === 1 ? "day" : "days"} you used it` : `across ${num(b.count)} ${COUNT_NOUN[b.type]}`}.</p>
      ) : <p>{inMonth ? `No transaction fees${inMonth}.` : "This statement has no transaction fees."}</p>}
      {r.regulars && (
        <p><b>You paid the same {r.regulars.people.length === 1 ? "number" : `${r.regulars.people.length} numbers`} almost every week,</b> {ksh(r.regulars.fees)} in fees{r.regulars.people.length > 1 ? " between them" : ""}. If any of them is a business with a Till number, paying by Till is free for you.</p>
      )}
    </div>
  );
}

function Fuliza({ r, inMonth, month }: { r: Report; inMonth: string; month: string | null }) {
  const f = r.fuliza;
  return (
    <div className="fuliza">
      <h2>Fuliza{inMonth}</h2>
      {f ? (
        <>
          <div className="stats">
            <div><p>Borrowed</p><p>{ksh(f.borrowed)}</p></div>
            <div><p>Charges paid</p><p className="lost">{ksh(f.charges)}</p></div>
            <div><p>Days you used it</p><p>{num(f.times)}</p></div>
            <div><p>Days overdrawn</p><p>{num(f.daysOverdrawn)}</p></div>
          </div>
          {!month && f.lateMonthShare >= 0.5 && <p className="small muted" style={{ marginTop: 14 }}>Most of your Fuliza use came in the last ten days of the month{r.income && r.income.day >= 20 ? ", before your regular income arrived" : ""}.</p>}
          {r.fees.fulizaEstimated && <p className="tiny muted" style={{ marginTop: 10 }}>{month ? "Charges are counted in the month you repaid them: what each repayment paid beyond what you'd borrowed." : "Charges are what you repaid beyond what you borrowed, for loans repaid within this statement."}</p>}
        </>
      ) : <p className="muted">{month ? `You didn't use Fuliza${inMonth}.` : "You didn't use Fuliza in this statement."}</p>}
    </div>
  );
}

function Months({ whole, view, month, onPick }: { whole: Report; view: Report; month: string | null; onPick: (m: string | null) => void }) {
  const max = Math.max(1, ...whole.months.flatMap((m) => [m.in, m.out]));
  const shown = month ? view : whole;
  return (
    <div>
      <h2>Money in and out, by month</h2>
      <div className={`bars${month ? " picking" : ""}`}>
        {whole.months.map((m) => (
          <button key={m.key} className="bar" aria-pressed={m.key === month} aria-label={`${monthName(m.key, true)}: in ${ksh(m.in)}, out ${ksh(m.out)}`} onClick={() => onPick(m.key === month ? null : m.key)}>
            <span className="pair"><span style={{ height: `${(m.in / max) * 150}px`, background: "var(--in)" }} /><span style={{ height: `${(m.out / max) * 150}px`, background: "var(--ink)" }} /></span>
            <span className="m">{m.label}</span>
          </button>
        ))}
      </div>
      <div className="key">
        <span><i style={{ background: "var(--in)" }} /><span className="plain">{month && <b>{monthName(month)}: </b>}<b>Money in {ksh(shown.moneyIn)}</b>{shown.fulizaIn > 0 && <>, of which {ksh(shown.fulizaIn)} was Fuliza</>}</span></span>
        <span><i style={{ background: "var(--ink)" }} /><span className="plain"><b>Money out {ksh(shown.moneyOut)}</b>{shown.fulizaOut > 0 && <>, of which {ksh(shown.fulizaOut)} was repaying Fuliza</>}</span></span>
        {!month && whole.income && <span className="muted">Regular income: {ksh(whole.income.amount)} around the {ordinal(whole.income.day)}</span>}
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>{month ? "Tap the month again to see the whole statement." : "Tap a month to see it."}</p>
    </div>
  );
}

function Categories({ r, inMonth, moves, setMoves }: { r: Report; inMonth: string; moves: Record<string, string>; setMoves: (m: Record<string, string>) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const cats = useMemo(() => {
    const m = new Map<string, { name: string; total: number; payees: Report["payees"] }>();
    for (const p of r.payees) {
      const c = moves[p.key] ?? p.category;
      const e = m.get(c) ?? { name: c, total: 0, payees: [] };
      e.total += p.total;
      e.payees.push(p);
      m.set(c, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [r.payees, moves]);
  const names = useMemo(() => [...new Set([...r.payees.map((p) => p.category), "Rent", "School fees", "Transport", "Shops and groceries", "Eating out", "Family and friends", "Business", "Other"])].sort(), [r.payees]);
  const max = cats[0]?.total ?? 1;
  return (
    <section className="section">
      <h2>Where it went{inMonth}</h2>
      {!cats.length && <p className="muted">No payments{inMonth}.</p>}
      {cats.map((c) => (
        <div className="cat" key={c.name}>
          <div className="cat-row">
            <span>{c.name}</span>
            <span className="track"><span style={{ width: `${(c.total / max) * 100}%` }} /></span>
            <span className="amt">{num(c.total)}</span>
            <button className="link-quiet" aria-expanded={open === c.name} onClick={() => setOpen(open === c.name ? null : c.name)}>{open === c.name ? "Done" : "Relabel"}</button>
          </div>
          {open === c.name && (
            <div className="payees">
              {c.payees.slice(0, 25).map((p) => (
                <div className="payee" key={p.key}>
                  <span>{payeeLabel(p.name, p.number, p.key)}</span>
                  <span className="muted">{ksh(p.total)}</span>
                  <label><span className="sr-only">Category for {p.name}</span>
                    <select value={moves[p.key] ?? p.category} onChange={(e) => setMoves({ ...moves, [p.key]: e.target.value })}>
                      {names.map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
              ))}
              {c.payees.length > 25 && <p className="small muted">And {c.payees.length - 25} more.</p>}
            </div>
          )}
        </div>
      ))}
      <p className="small muted" style={{ marginTop: 10 }}>Relabel one payee and every payment to that Paybill, Till or person follows.</p>
    </section>
  );
}

function People({ r, month }: { r: Report; month: string | null }) {
  const [show, setShow] = useState(false);
  const top = r.people.slice(0, 5);
  return (
    <div>
      <h2>{month ? `People you sent to most in ${monthName(month)}` : "People you send to most"}</h2>
      {top.length ? top.map((p) => (
        <div className="list-row" key={p.key}>
          <span>{show ? titleCase(p.name) : maskName(p.name)}<br /><span className="small muted">{p.number ? `${p.number}, ` : ""}{num(p.count)} {p.count === 1 ? "send" : "sends"}</span></span>
          <span className="amt">{ksh(p.total)}</span>
        </div>
      )) : <p className="muted">You didn&apos;t send money to anyone {month ? `in ${monthName(month)}` : "in this statement"}.</p>}
      {top.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Names are {show ? "shown" : "masked"}. <button className="link-quiet" onClick={() => setShow(!show)}>{show ? "Mask names" : "Show full names"}</button></p>}
    </div>
  );
}

function Diagnose({ r }: { r: Report }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!r.diagnostics) return null;
  const text = diagnosticsText(r.diagnostics, r.balanceGaps);
  return (
    <section className="section diag">
      <button className="link-quiet" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide what PesaLens read" : "Results look wrong? See what PesaLens read"}</button>
      {open && (
        <>
          <p className="small muted" style={{ marginTop: 12, maxWidth: 680 }}>This shows the shape of each kind of line in your statement, with every name, number and amount removed. If the results look wrong, you can copy it and send it to the developer instead of your statement. Nothing is sent unless you send it.</p>
          <textarea readOnly value={text} rows={16} aria-label="What PesaLens read, with names, numbers and amounts removed" />
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy"}</button>
        </>
      )}
    </section>
  );
}
