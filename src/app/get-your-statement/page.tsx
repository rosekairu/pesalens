import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Header } from "@/components/Header";

export const metadata: Metadata = { title: "Get your M-Pesa statement | PesaLens" };

const STEPS: [string, string?][] = [
  ["Dial *334#", "On your Safaricom line. It's free."],
  ["Choose My Account, then M-PESA Statement"],
  ["Choose Full Statement and the period", "Pick 12 months to see a whole year."],
  ["Type your email address and confirm", "The statement goes there as a PDF."],
  ["Enter your M-PESA PIN", "This only approves the request. PesaLens never asks for your PIN."],
  ["Keep the SMS that arrives", "It has the code that opens the statement. Each statement has its own code."],
];

export default function Guide() {
  return (
    <>
      <Header />
      <main className="guide">
        <section>
          <h1>Get your M-Pesa statement</h1>
          <p className="intro">It takes about two minutes on any phone, and the statement usually lands in your email within a few minutes.</p>
          <ol className="steps">
            {STEPS.map(([t, d]) => <li key={t}><div><b>{t}</b>{d && <span>{d}</span>}</div></li>)}
          </ol>
          <div style={{ marginTop: 30 }}><Link href="/open" className="btn btn-primary">I have my statement, open it</Link></div>
        </section>
        <aside className="aside">
          <div className="card"><h2>On the M-PESA app</h2><p>Open Statements, choose the period, and download the PDF. You&apos;ll still get an SMS with the code.</p></div>
          <div className="card"><h2>If the SMS never comes</h2><p>Request the statement again. Each request makes a new PDF and a new code, so use the newest pair together.</p></div>
          <div className="callout"><p>PesaLens will never ask for your M-PESA PIN.</p><p>Only the statement file and the code that opens it.</p></div>
        </aside>
      </main>
      <Footer />
    </>
  );
}
