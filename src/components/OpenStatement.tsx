"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { StatementError, useStatement } from "@/lib/StatementContext";
import type { StatementErrorCode } from "@/lib/statement/types";

const MESSAGES: Record<StatementErrorCode, [string, string]> = {
  "needs-code": ["", ""],
  "wrong-code": ["That code didn't open this statement.", "Use the code from the SMS that came with this statement. Codes from earlier statements won't work. If the SMS never came, request the statement again."],
  "not-pdf": ["That file isn't a PDF.", "Choose the statement PDF from your email or the M-PESA app."],
  "not-statement": ["This PDF doesn't look like an M-PESA statement.", "Choose the full statement from your email or the M-PESA app. Mini statements by SMS can't be read."],
  "unsupported-layout": ["PesaLens can't read this statement's layout yet.", "Nothing was saved. Try a full statement requested on *334# or in the M-PESA app."],
};

export function OpenStatement() {
  const { read } = useStatement();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [locked, setLocked] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<StatementErrorCode | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function attempt(f: { bytes: Uint8Array }, withCode?: string) {
    setError(null);
    setProgress("Opening…");
    try {
      await read(f.bytes, withCode, "own", (done, total) => setProgress(`Reading page ${done} of ${total}…`));
      router.push("/results");
    } catch (e) {
      setProgress(null);
      const c = e instanceof StatementError ? e.code : "unsupported-layout";
      if (c === "needs-code") setLocked(true);
      else setError(c);
      if (c === "wrong-code") setLocked(true);
    }
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    const picked = { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
    setFile(picked);
    setLocked(false);
    setCode("");
    await attempt(picked);
  }

  const picker = (
    <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={(e) => choose(e.target.files?.[0])} />
  );

  if (!file) {
    return (
      <>
        {picker}
        <div
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files?.[0]); }}
        >
          <FileIcon />
          <button className="btn btn-primary" onClick={() => input.current?.click()}>Choose your statement PDF</button>
          <p className="small muted">Or drag it here. It&apos;s the PDF from the Safaricom email or the M-PESA app.</p>
        </div>
        <p className="small" style={{ marginTop: 18 }}><Link href="/get-your-statement" className="link">How to get your statement</Link></p>
      </>
    );
  }

  const [title, body] = error ? MESSAGES[error] : ["", ""];
  return (
    <>
      {picker}
      <div className="file-card">
        <FileIcon />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="name">{file.name}</p>
          <p className="small muted">{locked ? "Locked. Enter the code to open it." : progress ?? "Ready"}</p>
        </div>
        <button className="link" style={{ background: "none", border: 0, borderBottom: "2px solid", cursor: "pointer", fontSize: 15, padding: 0 }} onClick={() => input.current?.click()}>Choose another file</button>
      </div>

      {locked && (
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) attempt(file, code.trim()); }}>
          <label className="field-label" htmlFor="code">Code from the Safaricom SMS</label>
          <div className="code-row">
            <input id="code" className="code-input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-describedby="code-help" autoFocus />
            <button type="button" className="btn" style={{ minHeight: 58 }} onClick={async () => { try { setCode((await navigator.clipboard.readText()).trim()); } catch { /* the browser didn't allow it; typing still works */ } }}>Paste</button>
          </div>
          <p id="code-help" className="small muted" style={{ marginTop: 10 }}>Each statement has its own code, sent by SMS when you asked for the statement. Older statements may use your ID number instead.</p>
          <div className="sms-hint">
            <div className="sms-sketch" aria-hidden="true"><i style={{ width: "90%" }} /><i style={{ width: "70%" }} /><i style={{ width: "38%", display: "inline-block", marginRight: 6 }} /><b>48217365</b></div>
            <p>Look for the SMS that arrived when you requested the statement. The code is the number in it. The wording can differ.</p>
          </div>
          <button className="btn btn-primary wide-btn" disabled={!!progress || !code.trim()}>{progress ?? "Open statement"}</button>
        </form>
      )}

      {!locked && progress && <p className="small" style={{ marginTop: 20 }} role="status">{progress}</p>}

      {error && (
        <div className="error" role="alert">
          <p>{title}</p>
          <p>{body}</p>
        </div>
      )}
    </>
  );
}

function FileIcon() {
  return (
    <svg width="40" height="48" viewBox="0 0 40 48" aria-hidden="true" style={{ flex: "none" }}>
      <path d="M3 3h24l10 10v32H3z" fill="#F4F6FA" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M27 3v10h10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M10 24h18M10 31h18M10 38h11" stroke="#4E5A70" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
