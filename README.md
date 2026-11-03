# PesaLens

**What did M-Pesa transaction fees and Fuliza charges cost you this year?**

PesaLens reads your M-PESA full statement and shows what fees and Fuliza cost you, what drove them, and where the rest of your money went. The statement is read in your browser. It is never uploaded.

Live: https://pesalens-one.vercel.app

## What it shows

- **Fees by type:** sending, withdrawing, Paybill and other charges, totalled from the charge lines on the statement itself, so there is no fee table to go out of date.
- **Fuliza:** what you borrowed, the charges you paid, the days you used it and the days you were overdrawn.
- **What drove the fees:** your biggest fee type, and the people you pay almost every week (if they have a Till, paying by Till is free for you).
- **Money in and out by month**, with regular income picked out.
- **Where it went:** payments sorted into categories (rent, school fees, shops, transport and more). Move any payee to another category and every payment to them follows.
- **Regular payments** such as rent, internet and school fees, and **the people you send to most**, with names masked by default.

## Privacy by design

- The PDF is opened with [pdf.js](https://mozilla.github.io/pdf.js/) inside the browser. There are no API routes.
- A Content-Security-Policy limits the page to talking only to its own site (`connect-src 'self'`), so a statement can't be sent elsewhere even by a bug.
- Results live in memory. Nothing goes to localStorage or cookies. Closing the tab clears everything.
- Fonts and the pdf.js worker are served from the site itself.

## How it reads a statement

1. `extract.ts` pulls every word on every page with its position (and asks for the SMS code if the PDF is locked).
2. `layout.ts` finds the detailed table's header, works out the columns, and rebuilds rows, joining details that wrap onto a second line. A balance check flags statements where rows may have been missed.
3. `classify.ts` turns each Details line into a type (send, Paybill, Till, withdrawal, Fuliza, charge…) and a payee.
4. `analyse.ts` links each charge to its payment by receipt number and builds the report.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # parser and analysis tests against made-up statements
```

`scripts/make_sample.py` (Python, reportlab) builds the made-up sample statement in `public/`. Every person, number and business in it is invented.

## Not affiliated with Safaricom

M-PESA and Fuliza are Safaricom trademarks. PesaLens is an independent project and is not endorsed by Safaricom.

## Licence

MIT
