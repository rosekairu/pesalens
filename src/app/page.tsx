import Link from "next/link";
import { Footer, Header } from "@/components/Header";
import { SampleButton } from "@/components/SampleButton";

// Made-up confirmations in the shape M-Pesa sends them.
const MESSAGES = [
  { code: "TK41QA7Z2P", text: "Ksh350.00 sent to JOHN K. 0712xxx678 on 3/10/26", cost: "7.00", type: "Send money" },
  { code: "TK48RB2M9C", text: "Ksh2,000.00 withdrawn from 284113 STAGE AGENT on 4/10/26", cost: "29.00", type: "Withdraw" },
  { code: "TK51DW8L0E", text: "Ksh480.00 sent to MAMA MBOGA 0722xxx104 on 6/10/26", cost: "7.00", type: "Send money" },
  { code: "TK55HN3Q7Y", text: "Ksh1,200.00 paid to 888880 for account HSE4 on 7/10/26", cost: "10.00", type: "Paybill" },
  { code: "TK60PV1S4J", text: "Ksh250.00 sent to WANJIRU 0701xxx330 on 9/10/26", cost: "7.00", type: "Send money" },
];

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="text">
            <h1>What did M-Pesa transaction fees and Fuliza charges cost you this year?</h1>
            <p className="sub">See where your M-Pesa went.</p>
            <div className="actions">
              <SampleButton />
              <Link href="/open" className="btn">Open my statement</Link>
            </div>
            <p className="privacy">Your statement is read on this device. Nothing is uploaded, and nothing is kept after you close the page.</p>
            <p className="guide-link"><Link href="/get-your-statement" className="link">Don&apos;t have your statement yet? Here&apos;s how to get it</Link></p>
          </div>
          <div className="inbox" role="img" aria-label="Five M-Pesa confirmation messages, each ending with a transaction cost, added up to Ksh 60 for one week">
            <div className="phone" aria-hidden="true">
              <p className="from">MPESA</p>
              {MESSAGES.map((m) => (
                <div className="msg-row" key={m.code}>
                  <p className="sms">{m.code} Confirmed. {m.text}. <mark>Transaction cost, Ksh{m.cost}</mark>.</p>
                  <span className="tie" />
                </div>
              ))}
            </div>
            <div className="tally" aria-hidden="true">
              <h2>This week&apos;s costs</h2>
              <div className="rows">{MESSAGES.map((m) => <div key={m.code}><span>{m.type}</span><span>{m.cost}</span></div>)}</div>
              <div className="total"><span>Total</span><span>Ksh 60.00</span></div>
              <p className="note">Every confirmation ends with a cost. PesaLens adds up a whole year of them.</p>
            </div>
          </div>
        </section>
        <section className="what" aria-label="What you'll see">
          <div><h2>Fees, by type</h2><p>Sending, withdrawing and Paybill charges, totalled from the cost line on every transaction.</p></div>
          <div><h2>What Fuliza really cost</h2><p>How much you borrowed, the charges you paid, and how many days you were overdrawn.</p></div>
          <div><h2>Where the rest went</h2><p>Rent, shops, school fees, transport and the people you send to most, sorted for you.</p></div>
        </section>
      </main>
      <Footer />
    </>
  );
}
