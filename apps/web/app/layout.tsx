import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "~/app/globals.css";

// Type pairing: Instrument Sans is the workhorse (UI, body, buttons, forms,
// coverage + legal text — Tailwind's default `font-sans`); Bricolage Grotesque
// is the personality font (logo, headlines, large numbers, empty states, short
// emotional copy — applied with `font-display`). Wired in globals.css.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FanGuard",
  description: "Insure your night. One tap.",
};

// Explicit mobile viewport — the Blink hosted flow + responsive checkout rely on it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrument.variable} ${bricolage.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
