/** One positioned piece of text from a PDF page. */
export type TextBit = { s: string; x: number; y: number; w: number };

/** A row from the detailed table, before it's classified. */
export type RawRow = {
  receipt: string;
  /** Completion time as a naive local timestamp (UTC fields hold Nairobi wall-clock time). */
  t: number;
  details: string;
  status: string;
  paidIn: number;
  withdrawn: number;
  balance: number | null;
  /** How many amount cells the line had (for the diagnostics panel). */
  cells?: number;
};

export type Kind =
  | "send" | "pochi" | "paybill" | "till" | "withdraw" | "airtime"
  | "received" | "business-in" | "deposit"
  | "savings-in" | "savings-out"
  | "charge" | "fuliza-draw" | "fuliza-repay" | "fuliza-fee"
  | "reversal" | "other";

export type FeeType = "send" | "paybill" | "till" | "withdraw" | "pochi" | "other";

export type Classified = {
  kind: Kind;
  /** For charges: which kind of transaction the charge belongs to. */
  feeType?: FeeType;
  /** Stable key for the other party, e.g. "phone:0712***678", "paybill:888880:14104415022", "till:5133701". */
  key?: string;
  /** Human label for the other party, as printed. */
  name?: string;
  /** Phone, till or paybill number, as printed (already masked by Safaricom). */
  number?: string;
  account?: string;
  viaFuliza?: boolean;
};

export type Txn = RawRow & Classified;

export type StatementErrorCode = "needs-code" | "wrong-code" | "not-pdf" | "not-statement" | "unsupported-layout";

export class StatementError extends Error {
  constructor(public code: StatementErrorCode, message?: string) {
    super(message ?? code);
    this.name = "StatementError";
  }
}
