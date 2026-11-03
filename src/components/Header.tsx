"use client";
import Link from "next/link";
import { Logo } from "./Logo";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/get-your-statement", label: "Get your statement" },
  { href: "/your-data", label: "How your data is handled" },
];

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <Logo />
      <button className="menu-btn" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}>
        <span className="sr-only">Menu</span>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
      </button>
      <nav id="main-nav" aria-label="Main" className={`nav${open ? " open" : ""}`}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined} onClick={() => setOpen(false)}>{l.label}</Link>
        ))}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <span>Built by <a href="https://rosekairu.com" rel="noopener">Rose Kairu</a>. Not affiliated with Safaricom.</span>
      <span>© {new Date().getFullYear()}</span>
    </footer>
  );
}
