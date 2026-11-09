import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Provozní portál — JK servis",
    template: "%s · Provozní portál",
  },
  description: "Evidence servisních zakázek a výjezdů místo Excelu. Ukázkový projekt.",
  // Ukázka do portfolia — vyhledávače ji indexovat nemají.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/*
 * Každá stránka se vykresluje až na požádání — jinak by Next.js nemohl
 * na skripty doplnit jednorázový klíč z Content-Security-Policy
 * (src/lib/csp.ts) a prohlížeč by je zablokoval.
 */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="cs">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
