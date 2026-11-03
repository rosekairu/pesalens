import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Header } from "@/components/Header";

export const metadata: Metadata = { title: "How your data is handled | PesaLens" };

export default function YourData() {
  return (
    <>
      <Header />
      <main className="prose">
        <h1>How your data is handled</h1>
        <p><strong>Your statement never leaves your device.</strong> PesaLens reads the PDF inside your browser. There is no server that receives it, no account, and nothing to delete afterwards.</p>

        <h2>What PesaLens reads</h2>
        <p>The statement PDF you choose, and the code that opens it. From the statement it reads each transaction: the date, the details line, and the amounts. That&apos;s all it needs.</p>
        <p>It never asks for your M-PESA PIN, your ID number or your phone number. If someone asks for your PIN while claiming to be PesaLens, it isn&apos;t us.</p>

        <h2>What happens to it</h2>
        <ul>
          <li>The results live in the page&apos;s memory while it&apos;s open. Closing or refreshing the page clears them.</li>
          <li>Nothing is saved to your browser&apos;s storage, and no cookies are set.</li>
          <li>The page is only allowed to load from and talk to this site, so the statement can&apos;t be sent anywhere else, even by mistake.</li>
          <li>The labels you change while looking at results are kept only until you close the page.</li>
        </ul>

        <h2>The people in your statement</h2>
        <p>Your statement holds the names and numbers of everyone you paid or were paid by. PesaLens masks their names by default, and you choose whether to show them.</p>

        <h2>What the website host sees</h2>
        <p>Like any website, the host keeps ordinary visit logs, such as which pages were loaded. It never sees your statement or your results, because they never reach it.</p>

        <h2>Check it yourself</h2>
        <p>The code is public on <a href="https://github.com/rosekairu/pesalens" rel="noopener">GitHub</a>. You can also open your browser&apos;s network tools while you open a statement: you&apos;ll see nothing being sent.</p>

        <p style={{ marginTop: 34 }}><Link href="/open" className="btn btn-primary">Open my statement</Link></p>
      </main>
      <Footer />
    </>
  );
}
