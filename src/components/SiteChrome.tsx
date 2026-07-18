"use client";

/** The QM-tool nav + footer. Hidden on the partner app (/partner) so the phone mock gets a clean canvas. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { resetDemoState } from "../lib/client-store";

const isPartner = (p: string | null) => !!p && p.startsWith("/partner");

export function TopNav() {
  const pathname = usePathname();
  if (isPartner(pathname)) return null;
  return (
    <nav className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand)] text-[15px] font-extrabold lowercase tracking-tight text-white">uc</div>
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight">Urban Company</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">Partner Quality</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/partner" className="rounded-full bg-[var(--brand-tint)] px-3 py-1 text-[12px] font-bold text-[var(--brand-deep)] ring-1 ring-[var(--line)] transition-colors hover:bg-[var(--brand)] hover:text-white">Partner view ↗</Link>
          <span className="rounded-full bg-[var(--page)] px-3 py-1 text-[12px] font-semibold text-[var(--ink-2)] ring-1 ring-[var(--line)]">Beauty · Delhi NCR</span>
          <button onClick={() => { if (window.confirm("Clear all demo decisions, appeals and flags saved in this browser?")) resetDemoState(); }}
            className="rounded-full px-3 py-1 text-[12px] font-semibold text-[var(--ink-3)] ring-1 ring-[var(--line)] transition-colors hover:text-[var(--ink)]"
            title="Decisions, appeals and flags persist in this browser until you reset them">Reset demo</button>
        </div>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (isPartner(pathname)) return null;
  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-[12px] text-[var(--ink-3)]">
        <span>Demo · synthetic data only</span>
        <span>Anything that affects a partner&apos;s earnings needs your approval first.</span>
      </div>
    </footer>
  );
}
