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
    <html lang="en" suppressHydrationWarning>
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
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `new MutationObserver(function(m){m.forEach(function(r){if(r.type==="attributes"&&r.attributeName==="fdprocessedid"){r.target.removeAttribute("fdprocessedid")}})}).observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:["fdprocessedid"]});window.addEventListener("beforeunload",function(){window.scrollTo(0,0)})`,
          }}
        />
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
