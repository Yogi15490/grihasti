import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grihasti — The Bhai-Behen Collection",
  description:
    "A limited Rakhi drop: 14 caricature candles, one for every kind of sibling. Handmade, limited, gone after Rakhi.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://grihasti.in"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
