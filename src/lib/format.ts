const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const ksh = (n: number) => `KSh ${nf.format(Math.round(n))}`;
export const num = (n: number) => nf.format(Math.round(n));

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
export const shortMonth = (t: number) => {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
};

export const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
};

/** "JOHN KAMAU" → "J*** K***" */
export const maskName = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + "***").join(" ");

/** "JOHN KAMAU" → "John Kamau" */
const KEEP = new Set(["KCB", "KPLC", "NCBA", "KRA", "NHIF", "SHA", "NSSF", "ABSA", "DTB", "I&M", "CBA", "NBK", "HELB", "SACCO", "ATM", "TV", "M-PESA"]);
const SMALL = new Set(["and", "of", "for", "the", "to", "in", "on", "at", "by", "with"]);
export const titleCase = (s: string) =>
  s.split(/\s+/).map((w, i) => {
    if (KEEP.has(w.toUpperCase())) return w.toUpperCase();
    if (i > 0 && SMALL.has(w.toLowerCase())) return w.toLowerCase();
    return w.toLowerCase().replace(/(^|[(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  }).join(" ");
