import type { Txn } from "./types";

/** Where a payment goes by default. People can move any payee to another category. */
export function defaultCategory(t: Pick<Txn, "kind" | "name" | "account">): string {
  const name = (t.name ?? "").toUpperCase();
  const acc = (t.account ?? "").toUpperCase();
  switch (t.kind) {
    case "send":
    case "pochi":
      return "Sent to people";
    case "withdraw":
      return "Cash withdrawals";
    case "airtime":
      return "Airtime and data";
    case "savings-in":
      return "Savings and loans";
    case "paybill":
      if (/\b(HSE|HOUSE|RENT|APT|FLAT|UNIT|APARTMENT)/.test(acc) || /RENT|PROPERT|ESTATE|LANDLORD/.test(name)) return "Rent";
      if (/SCHOOL|ACADEMY|COLLEGE|UNIVERSITY|PRIMARY|KINDERGARTEN|FEES/.test(name + " " + acc)) return "School fees";
      if (/KPLC|POWER|ELECTRIC|TOKEN|WATER/.test(name)) return "Electricity and water";
      if (/FIBRE|FIBER|INTERNET|BROADBAND|WIFI|ZUKU|DSTV|GOTV|SHOWMAX|NETFLIX|TV\b/.test(name)) return "Internet and TV";
      if (/AIRTEL|TELKOM/.test(name)) return "Sent to people";
      if (/BANK|SACCO|KCB|EQUITY|NCBA|CO-?OP|STANBIC|ABSA|LOAN|INSURANCE|NHIF|SHA\b|NSSF|KRA/.test(name)) return "Banks, saccos and government";
      return "Other bills";
    case "till":
      if (/SACCO|MATATU|SHUTTLE|\bBUS\b|TRAVEL|UBER|BOLT|LITTLE|TAXI|FARE|PETROL|FUEL|SHELL|TOTAL\b|RUBIS/.test(name)) return "Transport";
      if (/HOTEL|CAFE|RESTAURANT|CHOMA|EATERY|KITCHEN|PIZZA|CHICKEN|BAR\b|GRILL/.test(name)) return "Eating out";
      return "Shops and groceries";
    default:
      return "Other";
  }
}
