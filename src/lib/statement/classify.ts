import type { Classified, FeeType } from "./types";

// Statements sometimes lose the space at a line wrap ("Lipa naKCB", "to6120440"), so patterns allow optional spaces.
const FULIZA = /Fuliza/i;
const PHONE = /((?:\+?254|0)\d[\d*]{5,11}\d)/;

function clean(s: string) {
  // The page footer's disclaimer can end up glued to the last line on a page.
  // Some statements escape apostrophes ("St. Mary\'s").
  return s.replace(/\s*Disclaimer:.*$/i, "").replace(/\\(['"])/g, "$1").replace(/\s+/g, " ").trim();
}

/** Some statements leave the number out ("Customer Transfer to - NAME"), so fall back to the name. */
function party(prefix: string, rawNumber: string, rawName: string) {
  let name = clean(rawName);
  let found = PHONE.exec(rawNumber)?.[1];
  // Some statements put the number after the dash: "to - 2547******78 JOHN KAMAU".
  const lead = /^((?:\+?254|0)\d[\d*]{5,11}\d)\s+(.*)$/.exec(name);
  if (lead) { found ??= lead[1]; name = lead[2]; }
  const number = found ? phoneKey(found) : undefined;
  return { key: number ? `${prefix}:${number}` : `${prefix}-name:${name.toUpperCase()}`, number, name };
}

/** Normalises a printed phone so 0712***678 and 254712***678 match. */
export function phoneKey(p: string) {
  return p.replace(/^\+?254/, "0");
}

function chargeType(d: string): FeeType {
  if (/transfer|send/i.test(d)) return "send";
  if (/pay\s*bill/i.test(d)) return "paybill";
  if (/withdraw/i.test(d)) return "withdraw";
  if (/merchant|buy\s*goods|till/i.test(d)) return "till";
  if (/small\s*business|pochi/i.test(d)) return "pochi";
  return "other";
}

/** Works out what a statement line is from its Details text. */
export function classify(details: string, paidIn: number, withdrawn: number): Classified {
  const d = clean(details);
  const viaFuliza = FULIZA.test(d);
  let m: RegExpExecArray | null;

  if (/^OverDraft\s*of\s*Credit\s*Party/i.test(d)) return { kind: "fuliza-draw" };
  if (/^OD\s*Loan\s*Repayment/i.test(d)) return { kind: "fuliza-repay" };
  if (/^(Fuliza|Over\s*Draft|OD)\b.*(Fee|Charge|Interest)/i.test(d)) return { kind: "fuliza-fee" };
  if (/Charge$/i.test(d) || /^(Customer Transfer of Funds|Pay Bill|Withdrawal|Pay Merchant|Merchant Payment)\s*Charge/i.test(d)) return { kind: "charge", feeType: chargeType(d) };
  if (/Reversal/i.test(d)) return { kind: "reversal" };

  // Pochi la Biashara appears as "Small Business" or "Micro SME Business".
  if ((m = /(?:Small|Micro\s*SME)\s*Business(?:\s*with\s*Fuliza\s*M-?\s*Pesa)?\s*to\s*(.*?)\s*-\s*(.*)$/i.exec(d))) {
    return { kind: "pochi", ...party("pochi", m[1], m[2]), viaFuliza };
  }
  if ((m = /^Customer\s*(?:Transfer|Send\s*Money)(?:\s*Fuliza\s*M-?\s*Pesa)?\s*to\s*(.*?)\s*-\s*(.*)$/i.exec(d))) {
    return { kind: "send", ...party("phone", m[1], m[2]), viaFuliza };
  }
  if ((m = /^Pay\s*Bill(?:\s*Online)?(?:\s*Fuliza\s*M-?\s*Pesa)?\s*to\s*(\d+)\s*-\s*(.*?)\s*\bAcc\.\s*(.*)$/i.exec(d))) {
    const account = clean(m[3]).replace(/\s*incl of Ksh.*$/i, "");
    return { kind: "paybill", key: `paybill:${m[1]}:${account.toUpperCase()}`, number: m[1], name: clean(m[2]), account, viaFuliza };
  }
  if ((m = /^Pay\s*Bill(?:\s*Online)?(?:\s*Fuliza\s*M-?\s*Pesa)?\s*to\s*(\d+)\s*-?\s*(.*)$/i.exec(d))) {
    return { kind: "paybill", key: `paybill:${m[1]}`, number: m[1], name: clean(m[2]), viaFuliza };
  }
  if ((m = /^Offnet\s*C2B\s*Transfer\s*to\s*(\d+)\s*-\s*(.*?)(?:\.|$)/i.exec(d))) {
    return { kind: "paybill", key: `paybill:${m[1]}`, number: m[1], name: clean(m[2]), viaFuliza };
  }
  if ((m = /^(?:Merchant|Buy\s*Goods)\s*Payment(?:\s*Fuliza\s*M-?\s*Pesa)?(?:\s*Online)?\s*to\s*(\d+)\s*-\s*(.*)$/i.exec(d))) {
    return { kind: "till", key: "till:" + m[1], number: m[1], name: clean(m[2]).replace(/\s*via\s*\w+$/i, ""), viaFuliza };
  }
  if ((m = /Withdrawal\s*at\s*Agent\s*Till(?:\s*with\s*Fuliza)?\s*(?:to\s*)?(\d+)\s*-?\s*(.*)$/i.exec(d))) {
    return { kind: "withdraw", key: "agent:" + m[1], number: m[1], name: clean(m[2]), viaFuliza };
  }
  if (/Airtime|Bundle\s*Purchase|Recharge/i.test(d)) return { kind: "airtime", key: "airtime", name: "Airtime and data", viaFuliza };
  if (/M-?\s*Shwari|KCB\s*M-?\s*PESA|Lock\s*Savings|Ziidi/i.test(d)) {
    return { kind: withdrawn > 0 ? "savings-in" : "savings-out", key: "savings:" + d.split(/\s/)[0], name: d };
  }
  if ((m = /^Funds\s*received\s*from\s*(.*?)\s*-\s*(.*)$/i.exec(d))) {
    return { kind: "received", ...party("phone", m[1], m[2]) };
  }
  if ((m = /^(?:Transfer\s*from\s*Bank|(?:Business|Promotion|Salary|B2C|Merchant\s*Customer)\s*Payment\s*from)\s*(\d+)\s*-\s*(.*?)(?:\s*via\s*API.*)?$/i.exec(d))) {
    return { kind: "business-in", key: "org:" + m[1], number: m[1], name: clean(m[2]).replace(/\.$/, "") };
  }
  if (/Deposit\s*of\s*Funds\s*at\s*Agent/i.test(d)) return { kind: "deposit", name: "Cash deposits" };
  return { kind: "other", name: d };
}
