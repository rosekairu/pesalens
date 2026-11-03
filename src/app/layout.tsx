import type { Metadata, Viewport } from "next";
// Fonts are bundled and served from this site, so no third party sees who visits.
import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { StatementProvider } from "@/lib/StatementContext";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://pesalens-one.vercel.app")),
  title: "PesaLens: what did M-Pesa fees and Fuliza cost you this year?",
  description: "Open your M-Pesa statement and see what transaction fees and Fuliza charges cost you, and where the rest of your money went. Read in your browser, never uploaded.",
  openGraph: { siteName: "PesaLens", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#E9EEF5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-KE">
      <body>
        <StatementProvider>{children}</StatementProvider>
      </body>
    </html>
  );
}
