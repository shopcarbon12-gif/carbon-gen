import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script id="scroll-reset" strategy="beforeInteractive">{`
          try {
            if ("scrollRestoration" in history) {
              history.scrollRestoration = "manual";
            }
            window.scrollTo(0, 0);
            window.addEventListener("pageshow", function () {
              window.scrollTo(0, 0);
            });
          } catch {}
        `}</Script>
        <div className="app-bg-photo" aria-hidden />
        <div className="app-bg-fade" aria-hidden />
        <div className="app-root-content">{children}</div>
      </body>
    </html>
  );
}
