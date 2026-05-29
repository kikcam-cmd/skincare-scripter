import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { headers } from "next/headers";
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
  title: "skincare-scripter",
  description: "TikTok scripting copilot for the skincare niche",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  // proxy.ts sets x-skincare-role. Default to admin so anything bypassing
  // the proxy (shouldn't happen in prod given the matcher) doesn't silently
  // degrade to tester UI.
  const role = h.get("x-skincare-role") === "tester" ? "tester" : "admin";
  const isAdmin = role === "admin";

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
            <Link
              href={isAdmin ? "/" : "/scripts/new"}
              className="font-mono text-sm tracking-tight"
            >
              skincare-scripter
            </Link>
            <nav className="text-sm text-muted-foreground flex items-center gap-4">
              {isAdmin && (
                <>
                  <Link href="/" className="hover:text-foreground">Upload</Link>
                  <Link href="/products" className="hover:text-foreground">Products</Link>
                  <Link href="/knowledge" className="hover:text-foreground">Knowledge</Link>
                  <Link href="/search" className="hover:text-foreground">Search</Link>
                </>
              )}
              <Link
                href={isAdmin ? "/scripts" : "/scripts/new"}
                className="hover:text-foreground"
              >
                Scripts
              </Link>
              {isAdmin && (
                <Link href="/trust" className="hover:text-foreground">Trust</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
