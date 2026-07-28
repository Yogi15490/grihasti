import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * §1: the brand is Devanagari-first. गृहस्ती leads the title; the Latin
 * "Grihasti" follows because search, browser tabs and link previews are
 * exactly the functional contexts the transliteration exists for.
 *
 * §8 voice: plain, warm, unhurried. Concrete nouns, no urgency.
 */
export const metadata: Metadata = {
  title: {
    default: "गृहस्ती · Grihasti — The Bhai-Behen Collection",
    template: "%s · गृहस्ती",
  },
  description:
    "Fourteen caricature candles for Raksha Bandhan, one for every kind of sibling. " +
    "Made in small batches. Order by 21 August.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://grihasti.in"),
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon-180.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "गृहस्ती · Grihasti — The Bhai-Behen Collection",
    description:
      "Fourteen caricature candles for Raksha Bandhan, one for every kind of sibling.",
    siteName: "गृहस्ती",
    locale: "en_IN",
    type: "website",
  },
};

export const viewport: Viewport = {
  // §4 Haldi — the browser chrome inherits the mark's colour.
  themeColor: "#C98A2B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang="en" with Devanagari inline: the page is English-led with Hindi
    // alongside (§8), so individual Hindi passages carry their own lang.
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
