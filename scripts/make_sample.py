"""Builds a made-up M-PESA full statement PDF for the demo and the tests.

Every person, number, business and charge in it is invented. The layout follows the
2025 full statement: header, summary table, then a detailed table of
Receipt No / Completion Time / Details / Transaction Status / Paid in / Withdrawn / Balance,
newest first, with each charge on its own row sharing the receipt number.

Usage: python3 scripts/make_sample.py out.pdf [--negative] [--seed N]
"""
import random, sys, datetime as dt
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

args = sys.argv[1:]
out = args[0] if args else "sample.pdf"
NEG = "--negative" in args          # older statements print withdrawals as negatives
CENTERED = "--centered" in args     # headings centred over their columns
BLANK = "--blank" in args           # empty amount cells instead of 0.00
ONELINE = "--oneline-time" in args  # date and time on one line
seed = int(args[args.index("--seed") + 1]) if "--seed" in args else 7
rnd = random.Random(seed)

START = dt.datetime(2025, 11, 1); END = dt.datetime(2026, 10, 31, 23, 59)

def send_fee(a):
    for lim, f in [(100,0),(500,7),(1000,13),(1500,23),(2500,33),(3500,53),(5000,57),(7500,78),(10000,90),(15000,100),(20000,105)]:
        if a <= lim: return f
    return 108
def withdraw_fee(a):
    for lim, f in [(2500,29),(3500,52),(5000,69),(7500,87),(10000,115)]:
        if a <= lim: return f
    return 167

events = []   # (time, kind, details, amount, extra)
def at(day, h=None):
    return day.replace(hour=h if h is not None else rnd.randint(6, 21), minute=rnd.randint(0, 59), second=rnd.randint(0, 59))

PEOPLE = [("0712***678", "JOHN KAMAU"), ("0701***330", "WANJIRU NJERI"), ("0722***104", "MARY MUTHONI")]
OTHERS = [("0733***902", "CHAMA YETU TREASURER"), ("0745***221", "PETER OTIENO"), ("0798***455", "GRACE AKINYI"),
          ("0711***870", "DAVID MWANGI"), ("0725***613", "FAITH WAMBUI"), ("0790***384", "BRIAN KIPRONO")]
TILLS = [("5133701", "KILIMANI FRESH MART"), ("5260448", "MAMA PIMA GROCERS"), ("7781203", "CITY HOPPA SACCO"),
         ("8812045", "JUA KALI HARDWARE"), ("6620981", "BIASHARA BOOKSHOP"), ("7019344", "NYAMA CHOMA CORNER")]

day = START
while day <= END:
    d = day.day
    if d == 27: events.append((at(day, 9), "in", "Business Payment from 501901 - EQUITY BULK ACCOUNT via API. Original conversation ID is EQU%07d." % rnd.randint(1, 9999999), 68000, None))
    if d == 5: events.append((at(day), "paybill", "Pay Bill Online to 247247 - EQUITY PAYBILL ACCOUNT Acc. HSE4", 18000, 0))
    if d == 12: events.append((at(day), "paybill", "Pay Bill Online to 150501 - NETLINK HOME FIBRE Acc. 20114", 3500, 0))
    if d == 28: events.append((at(day), "send", "Customer Transfer to %s - %s" % OTHERS[0], 2000, None))
    if d == 3 and day.month in (1, 5, 9): events.append((at(day), "paybill", "Pay Bill Online to 522522 - KCB Acc. ST MARYS ACADEMY 1043", 35000, 0))
    if d in (2, 17): events.append((at(day), "paybill", "Pay Bill Online to 888880 - KPLC PREPAID Acc. 14104415022", rnd.choice([1000, 1500]), 0))
    if d == 28: events.append((at(day), "mshwari", "M-Shwari Deposit", 3000, None))
    # Weekly sends to the same three people
    if day.weekday() == 5:
        for i, (ph, nm) in enumerate(PEOPLE):
            if rnd.random() < 0.92:
                events.append((at(day), "send", "Customer Transfer to %s - %s" % (ph, nm), rnd.choice([[350, 400, 500], [1000, 1200, 1500], [250, 300, 480]][i]), None))
    # Daily life: tills, transport, airtime, the odd send
    if day.weekday() < 5 and rnd.random() < 0.8: events.append((at(day, 7), "till", "Merchant Payment to %s - %s" % TILLS[2], rnd.choice([80, 100, 120]), None))
    for _ in range(rnd.choice([0, 1, 1, 2])):
        t = rnd.choice([TILLS[0], TILLS[1], TILLS[1], TILLS[3], TILLS[4], TILLS[5]])
        events.append((at(day), "till", "Merchant Payment Online to %s - %s" % t, rnd.randint(3, 20) * 25, None))
    if rnd.random() < 0.25: events.append((at(day), "airtime", rnd.choice(["Airtime Purchase", "Customer Bundle Purchase"]), rnd.choice([50, 100, 250, 500]), None))
    if rnd.random() < 0.12:
        ph, nm = rnd.choice(OTHERS[1:])
        events.append((at(day), "send", "Customer Transfer to %s - %s" % (ph, nm), rnd.randint(4, 60) * 50, None))
    if rnd.random() < 0.06:
        ph, nm = rnd.choice(OTHERS[1:])
        events.append((at(day), "in", "Funds received from %s - %s" % (ph, nm), rnd.randint(4, 60) * 50, None))
    if rnd.random() < 0.035: events.append((at(day), "withdraw", "Customer Withdrawal At Agent Till 284113 - STAGE AGENT WESTLANDS", rnd.choice([1000, 2000, 3000]), None))
    day += dt.timedelta(days=1)

events.sort(key=lambda e: e[0])
letters = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"
def receipt(t):
    return "T" + "ABCDEFGHIJKL"[t.month - 1] + "".join(rnd.choice(letters) for _ in range(8))

rows = []   # chronological: (receipt, time, details, paid_in, withdrawn, balance)
bal = 6400.0; owed = 0.0; owed_since = None
for t, kind, det, amt, _ in events:
    r = receipt(t)
    if kind == "in":
        bal += amt; rows.append((r, t, det, amt, 0, bal))
        if owed > 0:   # Fuliza is repaid first from incoming money
            days = max(1, (t - owed_since).days)
            charge = round(owed * 0.01 + 0.0045 * owed * days, 0)  # made-up access fee plus daily charge
            pay = min(bal, owed + charge)
            bal -= pay; rows.append((receipt(t), t + dt.timedelta(seconds=1), "OD Loan Repayment to 232323 - M-PESA Overdraw", 0, pay, bal))
            owed = 0
        continue
    fee = {"send": send_fee(amt), "withdraw": withdraw_fee(amt)}.get(kind, 0)
    need = amt + fee
    fuliza = need > bal
    if fuliza:
        if kind == "paybill" and amt >= 18000:   # big bills wait for salary instead of Fuliza
            continue
        draw = round(need - bal, 2)
        rows.append((r, t, "OverDraft of Credit Party", draw, 0, bal + draw)); bal += draw
        if owed == 0: owed_since = t
        owed += draw
        det = det.replace("Customer Transfer to", "Customer Transfer Fuliza M-Pesa to").replace("Merchant Payment Online to", "Merchant Payment Fuliza M-Pesa Online to").replace("Merchant Payment to", "Merchant Payment Fuliza M-Pesa to").replace("Pay Bill Online to", "Pay Bill Online Fuliza M-Pesa to")
    bal -= amt; rows.append((r, t, det, 0, amt, bal))
    if fee:
        bal -= fee; rows.append((r, t, {"send": "Customer Transfer of Funds Charge", "withdraw": "Withdrawal Charge"}[kind], 0, fee, bal))

rows.reverse()   # statements list the newest first

# ---------- PDF ----------
W, H = A4
c = canvas.Canvas(out, pagesize=A4)
c.setTitle("M-PESA Statement (sample)")
COLS = [("Receipt No", 28), ("Completion Time", 86), ("Details", 150), ("Transaction Status", 352), ("Paid in", 418), ("Withdrawn", 470), ("Balance", 524)]
RIGHT = {"Paid in": 462, "Withdrawn": 516, "Balance": 572}
def money(v):
    s = "{:,.2f}".format(v)
    return ("-" + s) if (NEG and v) else s
def wrap(text, width=40):
    words, lines, cur = text.split(" "), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur: lines.append(cur); cur = w
        else: cur = (cur + " " + w).strip()
    lines.append(cur); return lines

def page_header(first):
    y = H - 40
    c.setFont("Helvetica-Bold", 13); c.drawString(28, y, "M-PESA STATEMENT"); y -= 22
    if first:
        c.setFont("Helvetica", 8)
        for k, v in [("Customer Name:", "AMANI WANJIKU (SAMPLE)"), ("Mobile Number:", "0700***000"), ("Date of Statement:", "01st 11 2026"), ("Statement Period:", "01st 11 2025 - 31st 10 2026")]:
            c.drawString(28, y, k); c.drawString(120, y, v); y -= 12
        y -= 8; c.setFont("Helvetica-Bold", 8); c.drawString(28, y, "SUMMARY"); y -= 12
        c.drawString(28, y, "TRANSACTION TYPE"); c.drawString(250, y, "PAID IN"); c.drawString(330, y, "PAID OUT"); y -= 11
        c.setFont("Helvetica", 8)
        sums = {}
        for _, _, d, pi, wd, _ in rows:
            key = "Send Money" if d.startswith("Customer Transfer to") or "Customer Transfer Fuliza" in d else "Pay Bill" if "Pay Bill" in d else "Customer Merchant Payment" if "Merchant Payment" in d else "OD Repayment" if "OD Loan" in d else "OD Disbursement" if "OverDraft" in d else "Cash Out" if "Withdrawal" in d else "Other"
            a = sums.setdefault(key, [0, 0]); a[0] += pi; a[1] += wd
        for k, (pi, wd) in sums.items():
            c.drawString(28, y, k); c.drawString(250, y, "{:,.2f}".format(pi)); c.drawString(330, y, "{:,.2f}".format(wd)); y -= 11
        y -= 10; c.setFont("Helvetica-Bold", 8); c.drawString(28, y, "DETAILED STATEMENT"); y -= 14
    c.setFont("Helvetica-Bold", 7.5)
    edges = [x for _, x in COLS] + [W - 20]
    for i, (name, x) in enumerate(COLS):
        if CENTERED: c.drawCentredString((edges[i] + (RIGHT.get(name, edges[i + 1]))) / 2 if name not in RIGHT else (edges[i] + RIGHT[name]) / 2, y, name)
        elif name in RIGHT: c.drawRightString(RIGHT[name], y, name)
        else: c.drawString(x, y, name)
    return y - 13

pageno = 1
def footer():
    c.setFont("Helvetica", 7); c.drawString(28, 24, "Disclaimer: This is a made-up statement for the PesaLens demo. It is not issued by Safaricom.")
    c.drawRightString(W - 28, 24, "Page %d" % pageno)

y = page_header(True)
c.setFont("Helvetica", 7.5)
for r, t, d, pi, wd, b in rows:
    lines = wrap(d)
    need = 10 * max(2, len(lines)) + 3
    if y - need < 40:
        footer(); c.showPage(); pageno += 1; y = page_header(False); c.setFont("Helvetica", 7.5)
    c.drawString(28, y, r)
    if ONELINE: c.setFont("Helvetica", 6.2); c.drawString(86, y, t.strftime("%Y-%m-%d %H:%M:%S")); c.setFont("Helvetica", 7.5)
    else: c.drawString(86, y, t.strftime("%Y-%m-%d")); c.drawString(86, y - 10, t.strftime("%H:%M:%S"))
    for i, ln in enumerate(lines): c.drawString(150, y - 10 * i, ln)
    c.drawString(352, y, "COMPLETED")
    if pi or not BLANK: c.drawRightString(462, y, money(pi) if pi else "0.00")
    if wd or not BLANK: c.drawRightString(516, y, money(wd) if wd else "0.00")
    c.drawRightString(572, y, "{:,.2f}".format(b))
    y -= need
footer(); c.save()
print(out, len(rows), "rows,", pageno, "pages")
