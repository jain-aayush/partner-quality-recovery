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
  title: "Partner Quality Recovery · Urban Company",
  description:
    "Per-partner diagnose → intervene → monitor system for recovering underperforming service partners",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <nav className="sticky top-0 z-20 border-b border-[var(--line)] bg-white">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ink)] text-sm font-extrabold tracking-tight text-white">
              uc
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold tracking-tight">Urban Company</div>
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-3)]">
                Quality Ops
              </div>
            </div>
            <div className="mx-2 h-7 w-px bg-[var(--line)]" />
            <div className="text-[15px] font-semibold text-[var(--ink-2)]">
              Partner Quality Recovery
            </div>
            <div className="ml-auto hidden items-center gap-2 text-[13px] font-medium text-[var(--ink-3)] sm:flex">
              Beauty · Delhi NCR
              <span className="rounded-full border border-[var(--line)] bg-[var(--page)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-2)]">
                internal tool
              </span>
            </div>
          </div>
        </nav>
        {children}
        <footer className="mt-12 border-t border-[var(--line)] bg-white">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-[12px] text-[var(--ink-3)]">
            <span>Quality Ops internal tool — synthetic data only, no live partner records.</span>
            <span>
              Every income-affecting action requires named human approval before it takes effect.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
