import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartGuest | Manajemen Keluhan Tamu",
  description:
    "Catat keluhan tamu, klasifikasikan otomatis ke lima kategori, koreksi kategori oleh petugas, dan pantau penyelesaian per departemen.",
  keywords: ["operasional hotel", "manajemen keluhan", "tamu hotel", "dasbor hotel"],
  authors: [{ name: "Tim SmartGuest" }],
  icons: {
    icon: "/favicon.ico",
  }
};

export const viewport: Viewport = {
  themeColor: "#F7F5F1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
