import { describe, expect, it } from "vitest";
import { classify } from "../src/lib/statement/classify";
import { defaultCategory } from "../src/lib/statement/categories";

// Detail strings in the shapes real statements use, with made-up names and numbers.
describe("classify", () => {
  const cases: [string, string, Record<string, unknown>?][] = [
    ["Customer Transfer to 0712***678 - JOHN KAMAU", "send", { number: "0712***678", name: "JOHN KAMAU" }],
    ["Customer Transfer Fuliza M-Pesa to254712***678 - JOHN KAMAU", "send", { number: "0712***678", viaFuliza: true }],
    ["Customer Transfer of Funds Charge", "charge", { feeType: "send" }],
    ["Pay Bill Charge", "charge", { feeType: "paybill" }],
    ["Withdrawal Charge", "charge", { feeType: "withdraw" }],
    ["Pay Bill Online to 888880 - KPLC PREPAID Acc. 14104415022", "paybill", { number: "888880", name: "KPLC PREPAID", account: "14104415022" }],
    ["Pay Bill Fuliza M-Pesa to 522533 - Lipa naKCB Acc. 7581500", "paybill", { number: "522533", viaFuliza: true, account: "7581500" }],
    ["Pay Bill Online to 247247 - EQUITY PAYBILL ACCOUNT Acc. HSE4", "paybill", { name: "EQUITY PAYBILL ACCOUNT", account: "HSE4" }],
    ["Pay Bill Online Fuliza M-Pesa to 4076749 -TINGG Acc. 0783***129 incl of Ksh 3.00Processing fee", "paybill", { account: "0783***129" }],
    ["Merchant Payment Online to 5133701 - KILIMANI FRESH MART", "till", { number: "5133701", name: "KILIMANI FRESH MART" }],
    ["Merchant Payment Fuliza M-Pesa to7623398 - Muturi Shop via NBK", "till", { number: "7623398", name: "Muturi Shop" }],
    ["Customer Withdrawal At Agent Till 284113 - STAGE AGENT", "withdraw", { number: "284113" }],
    ["Customer Withdrawal at Agent Till withFuliza to 262039 - KENTEL SHOP", "withdraw", { number: "262039", viaFuliza: true }],
    ["OverDraft of Credit Party", "fuliza-draw"],
    ["OD Loan Repayment to 232323 - M-PESA Overdraw", "fuliza-repay"],
    ["Funds received from 254722***508 - MICHAEL OTIENO", "received", { number: "0722***508" }],
    ["Business Payment from 501901 - EQUITY BULK ACCOUNT via API. Original conversation ID is EQU1234567.", "business-in", { name: "EQUITY BULK ACCOUNT" }],
    ["Deposit of Funds at Agent Till 2906285 - CITY SHOP", "deposit"],
    ["Airtime Purchase", "airtime"],
    ["Offnet C2B Transfer to 585555 - AIRTELMONEY. for Mobile No. 254783***129", "paybill", { number: "585555" }],
  ];
  for (const [text, kind, extra] of cases) {
    it(text, () => {
      const c = classify(text, 0, 100);
      expect(c.kind).toBe(kind);
      if (extra) expect(c).toMatchObject(extra);
    });
  }
  it("treats M-Shwari deposits as savings, not spending", () => {
    expect(classify("M-Shwari Deposit", 0, 3000).kind).toBe("savings-in");
    expect(classify("M-Shwari Withdraw", 3000, 0).kind).toBe("savings-out");
  });
});

describe("defaultCategory", () => {
  it("files rent by the account, school fees, utilities and transport", () => {
    expect(defaultCategory({ kind: "paybill", name: "EQUITY PAYBILL ACCOUNT", account: "HSE4" })).toBe("Rent");
    expect(defaultCategory({ kind: "paybill", name: "KCB", account: "ST MARYS ACADEMY 1043" })).toBe("School fees");
    expect(defaultCategory({ kind: "paybill", name: "KPLC PREPAID", account: "1410" })).toBe("Electricity and water");
    expect(defaultCategory({ kind: "till", name: "CITY HOPPA SACCO" })).toBe("Transport");
    expect(defaultCategory({ kind: "till", name: "MAMA PIMA GROCERS" })).toBe("Shops and groceries");
  });
});

import { maskName, titleCase } from "../src/lib/format";
describe("names", () => {
  it("title-cases names but keeps known acronyms", () => {
    expect(titleCase("JOHN KAMAU")).toBe("John Kamau");
    expect(titleCase("KPLC PREPAID")).toBe("KPLC Prepaid");
    expect(titleCase("KCB")).toBe("KCB");
  });
  it("masks names to initials", () => expect(maskName("JOHN KAMAU")).toBe("J*** K***"));
});
