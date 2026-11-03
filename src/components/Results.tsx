"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStatement } from "@/lib/StatementContext";
import type { Report } from "@/lib/statement/analyse";
import type { FeeType } from "@/lib/statement/types";
import { ksh, longDate, maskName, num, ordinal, titleCase } from "@/lib/format";
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
  const { report, source, close } = useStatement();
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
      <ReportView r={report} sample={source === "sample"} />
      <Footer />
    </>
  );
}

function headline(r: Report) {
  const what = r.fuliza ? "M-Pesa transaction fees and Fuliza charges" : "M-Pesa transaction fees";
  const when = r.period.months >= 11 ? "this year" : r.period.months <= 1 ? "this month" : `in these ${r.period.months} months`;
  return `${what} cost you ${ksh(r.fees.total)} ${when}.`;
}

function ReportView({ r, sample }: { r: Report; sample: boolean }) {
  const feeParts = ((["send", "withdraw", "paybill", "till", "pochi", "other"] as FeeType[]).map((k) => ({ k: k as FeeType | "fuliza", v: r.fees.byType[k] })))
    .concat(r.fuliza ? [{ k: "fuliza", v: r.fees.fuliza }] : [])
    .filter((p) => p.v > 0 || p.k === "send" || p.k === "fuliza");
  return (
    <main className="results">
      <p className="muted">{sample ? "Sample statement" : "Your statement"}, {longDate(r.period.start)} to {longDate(r.period.end)}, {num(r.count)} transactions</p>
      <h1>{headline(r)}</h1>
      {r.balanceGaps > 0.05 && (
        <div className="error" role="note" style={{ maxWidth: 720 }}>
          <p>Some lines of this statement may not have been read correctly.</p>
          <p>The running balance doesn&apos;t add up on {Math.round(r.balanceGaps * 100)}% of lines, so treat the totals as close, not exact.</p>
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
        <Drivers r={r} />
      </section>

      <section className="two flip section">
        <Fuliza r={r} />
        <Months r={r} />
      </section>

      <Categories r={r} />

      <section className="two even section">
        <div>
          <h2>Regular payments</h2>
          {r.recurring.length ? r.recurring.map((x) => (
            <div className="list-row" key={x.key}>
              <span><b>{payeeLabel(x.name, x.number, x.key)}</b><br /><span className="small muted">{x.rhythm === "monthly" ? `Every month, around the ${ordinal(x.day ?? 1)}` : "Every few months"}</span></span>
              <span className="amt">{ksh(x.amount)}</span>
            </div>
          )) : <p className="muted">No payments repeat often enough to call regular.</p>}
        </div>
        <People r={r} />
      </section>
    </main>
  );
}

function payeeLabel(name: string, number?: string, key?: string) {
  const n = titleCase(name);
  if (key?.startsWith("paybill:")) {
    const acc = key.split(":")[2];
    return `${n}, Paybill ${number}${acc ? `, Acc. ${acc}` : ""}`;
  }
  if (key?.startsWith("till:")) return `${n}, Till ${number}`;
  if (key?.startsWith("phone:")) return `${n}, ${number}`;
  return n;
}

function Drivers({ r }: { r: Report }) {
  const b = r.biggestFee;
  return (
    <div className="card">
      <h2>What drove the fees</h2>
      {b ? (
        <p><b>{FEE_LABELS[b.type]} {b.type === "fuliza" ? "were" : "was"} your biggest fee:</b> {ksh(b.amount)} {b.type === "fuliza" ? `over ${num(b.count)} times you used it` : `across ${num(b.count)} ${COUNT_NOUN[b.type]}`}.</p>
      ) : <p>This statement has no transaction fees.</p>}
      {r.regulars && (
        <p><b>You paid the same {r.regulars.people.length === 1 ? "number" : `${r.regulars.people.length} numbers`} almost every week,</b> {ksh(r.regulars.fees)} in fees{r.regulars.people.length > 1 ? " between them" : ""}. If any of them is a business with a Till number, paying by Till is free for you.</p>
      )}
    </div>
  );
}

function Fuliza({ r }: { r: Report }) {
  const f = r.fuliza;
  return (
    <div className="fuliza">
      <h2>Fuliza</h2>
      {f ? (
        <>
          <div className="stats">
            <div><p>Borrowed</p><p>{ksh(f.borrowed)}</p></div>
            <div><p>Charges paid</p><p className="lost">{ksh(f.charges)}</p></div>
            <div><p>Days you used it</p><p>{num(f.times)}</p></div>
            <div><p>Days overdrawn</p><p>{num(f.daysOverdrawn)}</p></div>
          </div>
          {f.lateMonthShare >= 0.5 && <p className="small muted" style={{ marginTop: 14 }}>Most of your Fuliza use came in the last ten days of the month{r.income && r.income.day >= 20 ? ", before your regular income arrived" : ""}.</p>}
          {r.fees.fulizaEstimated && <p className="tiny muted" style={{ marginTop: 10 }}>Charges are what you repaid beyond what you borrowed, for loans repaid within this statement.</p>}
        </>
      ) : <p className="muted">You didn&apos;t use Fuliza in this statement.</p>}
    </div>
  );
}

function Months({ r }: { r: Report }) {
  const max = Math.max(1, ...r.months.flatMap((m) => [m.in, m.out]));
  return (
    <div>
      <h2>Money in and out, by month</h2>
      <div className="bars" role="img" aria-label={r.months.map((m) => `${m.label}: in ${ksh(m.in)}, out ${ksh(m.out)}`).join("; ")}>
        {r.months.map((m) => (
          <div key={m.key}>
            <div className="pair"><span style={{ height: `${(m.in / max) * 150}px`, background: "var(--in)" }} /><span style={{ height: `${(m.out / max) * 150}px`, background: "var(--ink)" }} /></div>
            <span className="m">{m.label}</span>
          </div>
        ))}
      </div>
      <div className="key">
        <span><i style={{ background: "var(--in)" }} />Money in {ksh(r.moneyIn)}</span>
        <span><i style={{ background: "var(--ink)" }} />Money out {ksh(r.moneyOut)}</span>
        {r.income && <span className="muted">Regular income: {ksh(r.income.amount)} around the {ordinal(r.income.day)}</span>}
      </div>
    </div>
  );
}

function Categories({ r }: { r: Report }) {
  const [moves, setMoves] = useState<Record<string, string>>({});
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
      <h2>Where it went</h2>
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

function People({ r }: { r: Report }) {
  const [show, setShow] = useState(false);
  const top = r.people.slice(0, 5);
  return (
    <div>
      <h2>People you send to most</h2>
      {top.length ? top.map((p) => (
        <div className="list-row" key={p.key}>
          <span>{show ? titleCase(p.name) : maskName(p.name)}<br /><span className="small muted">{p.number}, {num(p.count)} sends</span></span>
          <span className="amt">{ksh(p.total)}</span>
        </div>
      )) : <p className="muted">You didn&apos;t send money to anyone in this statement.</p>}
      {top.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Names are {show ? "shown" : "masked"}. <button className="link-quiet" onClick={() => setShow(!show)}>{show ? "Mask names" : "Show full names"}</button></p>}
    </div>
  );
}
