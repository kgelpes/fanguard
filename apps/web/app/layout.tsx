import type { Metadata } from "next";
import "~/app/globals.css";

export const metadata: Metadata = {
  title: "Fanguard",
  description: "Polymarket odds for live events.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
