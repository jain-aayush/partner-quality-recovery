import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Partner Quality · Urban Company",
  description: "Find out why a partner is underperforming — and act on it.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <nav className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand)] text-[15px] font-extrabold lowercase tracking-tight text-white">
              uc
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-extrabold tracking-tight">Urban Company</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
                Partner Quality
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="rounded-full bg-[var(--page)] px-3 py-1 text-[12px] font-semibold text-[var(--ink-2)] ring-1 ring-[var(--line)]">
                Beauty · Delhi NCR
              </span>
            </div>
          </div>
        </nav>
        {children}
        <footer className="mt-auto border-t border-[var(--line)] bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-[12px] text-[var(--ink-3)]">
            <span>Demo · synthetic data only</span>
            <span>Anything that affects a partner&apos;s earnings needs your approval first.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
