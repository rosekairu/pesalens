"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStatement } from "@/lib/StatementContext";

/** Opens the made-up sample statement through the same reader a real statement goes through. */
export function SampleButton({ className = "btn btn-primary" }: { className?: string }) {
  const { read } = useStatement();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const res = await fetch("/sample-statement.pdf");
            await read(new Uint8Array(await res.arrayBuffer()), undefined, "sample");
            router.push("/results");
          } catch {
            setFailed(true);
            setBusy(false);
          }
        }}
      >
        {busy ? "Reading the sample statement…" : "Try it with a sample statement"}
      </button>
      {failed && <p className="small" role="alert">The sample statement didn&apos;t load. Check your connection and try again.</p>}
    </>
  );
}
