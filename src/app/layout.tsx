import type { ReactNode } from "react";
import { Bricolage_Grotesque, Work_Sans } from "next/font/google";
import "./globals.css";

// Display face for headings/brand, body face for UI text and tables.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display-family",
});
const body = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-family",
});

export const metadata = {
  title: "Booking Assistant",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
