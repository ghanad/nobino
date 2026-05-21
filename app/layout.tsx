import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nobino Reservations",
  description: "Internal capacity-based reservation app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
