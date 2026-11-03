import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { OpenStatement } from "@/components/OpenStatement";

export const metadata: Metadata = { title: "Open your statement | PesaLens" };

export default function OpenPage() {
  return (
    <>
      <Header />
      <main className="narrow">
        <h1 className="page-title">Open your statement</h1>
        <p className="lede">It&apos;s read here, on this device. Nothing is uploaded.</p>
        <OpenStatement />
      </main>
    </>
  );
}
