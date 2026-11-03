import type { Metadata } from "next";
import { Results } from "@/components/Results";

export const metadata: Metadata = { title: "Your results | PesaLens", robots: { index: false } };

export default function ResultsPage() {
  return <Results />;
}
