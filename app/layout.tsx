import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const iranSansX = localFont({
  src: [
    {
      path: "../IranSansX/Webfonts/fonts/woff2/IRANSansX-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../IranSansX/Webfonts/fonts/woff2/IRANSansX-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../IranSansX/Webfonts/fonts/woff2/IRANSansX-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
});

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
      <body className={iranSansX.className}>{children}</body>
    </html>
  );
}
