import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AutoCapitalizeFirstLetter from "@/components/auto-capitalize-first-letter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Carbon Creative Studio",
  description: "AI image studio for Carbon operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href="/bg-template.jpg" />
        <link rel="preload" as="image" href="/brand/carbon-long-white-cropped.png" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          referrerPolicy="no-referrer"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AutoCapitalizeFirstLetter />
        <div className="app-bg-photo" aria-hidden />
        <div className="app-bg-fade" aria-hidden />
        <div className="app-bg-top-photo" aria-hidden />
        <div className="app-bg-top-fade" aria-hidden />
        <div className="app-root-content">{children}</div>
      </body>
    </html>
  );
}
