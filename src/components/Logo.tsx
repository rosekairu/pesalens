import Link from "next/link";

/** PesaLens mark: a magnifying glass over a till receipt, with the cost line in red. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" style={{ flex: "none" }}>
      <path d="M10 6h30v46l-5-4-5 4-5-4-5 4-5-4-5 4z" fill="#fff" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M17 17h16M17 25h16" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M17 33h9" stroke="#E5484D" strokeWidth="4" strokeLinecap="round" />
      <circle cx="40" cy="38" r="12" fill="#fff" fillOpacity=".6" stroke="currentColor" strokeWidth="4" />
      <path d="M49 47l8 8" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="PesaLens home">
      <LogoMark />
      <span>pesalens</span>
    </Link>
  );
}
