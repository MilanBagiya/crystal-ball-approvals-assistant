'use client';

import { HealthResponseSchema } from '@approvals/contracts';
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Expand,
  LayoutGrid,
  PanelLeft,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { getJson } from '@/lib/sseClient';
import { PlaceholderButton } from './PlaceholderButton';
import { useAssistantStore } from '@/store/assistantStore';

// A simplified dashboard shell around the Approvals page. Only "Approvals" is a real page in this demo.
const NAV: { label: string; icon: LucideIcon; current?: boolean }[] = [
  { label: 'Dashboard', icon: LayoutGrid },
  { label: 'Approvals', icon: ClipboardCheck, current: true },
  { label: 'Sites', icon: Building2 },
  { label: 'Team', icon: Users },
  { label: 'Reports', icon: BarChart3 },
];

function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="leading-tight">
        <p className="text-base font-bold tracking-tight text-slate-900">Digital Twin</p>
        <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-500 uppercase">Site operations</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Refresh page"
          onClick={() => window.location.reload()}
          className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-violet-500"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Full screen"
          onClick={() => void document.documentElement.requestFullscreen?.()}
          className="hidden size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-violet-500 sm:grid"
        >
          <Expand aria-hidden="true" className="size-4" />
        </button>
        <span
          aria-label="Signed in as Milan"
          role="img"
          className="ml-2 grid size-8 place-items-center rounded-full bg-amber-400 text-sm font-semibold text-white"
        >
          M
        </span>
      </div>
    </header>
  );
}

function SideNav() {
  return (
    <nav
      aria-label="Main"
      className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-slate-200 bg-white py-4 md:flex"
    >
      <span aria-hidden="true" className="mb-2 grid size-9 place-items-center text-slate-400">
        <PanelLeft className="size-5" />
      </span>
      {NAV.map(({ label, icon: Icon, current }) =>
        current ? (
          <Link
            key={label}
            href="/"
            aria-label={label}
            aria-current="page"
            title={label}
            className="grid size-10 place-items-center rounded-xl bg-violet-100 text-violet-700 transition focus-visible:outline-2 focus-visible:outline-violet-500"
          >
            <Icon aria-hidden="true" className="size-5" />
          </Link>
        ) : (
          <PlaceholderButton
            key={label}
            label={label}
            className="grid size-10 place-items-center rounded-xl text-slate-400 focus-visible:outline-2 focus-visible:outline-violet-500"
          >
            <Icon aria-hidden="true" className="size-5" />
          </PlaceholderButton>
        ),
      )}
    </nav>
  );
}

/** Shows whether the API has a working LLM, so a reviewer knows if they are seeing AI or standard answers. */
function StatusBar() {
  const sessionId = useAssistantStore((s) => s.sessionId);
  const [llm, setLlm] = useState<'configured' | 'not_configured' | 'offline'>();

  useEffect(() => {
    void getJson('/api/health', HealthResponseSchema, { sessionId }).then((result) =>
      setLlm(result.ok ? result.data.llm : 'offline'),
    );
  }, [sessionId]);

  const label =
    llm === 'configured'
      ? 'AI connected'
      : llm === 'not_configured'
        ? 'AI off: standard answers'
        : llm === 'offline'
          ? 'API offline'
          : 'Checking…';
  const dot = llm === 'configured' ? 'bg-emerald-500' : llm === 'offline' ? 'bg-red-500' : 'bg-amber-400';

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs text-slate-500 sm:px-6">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="hidden sm:inline">© 2026 Digital Twin demo</span>
      <span className="font-semibold tracking-wide text-violet-700">APPROVALS</span>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-slate-100/70">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto p-3 sm:p-5">{children}</main>
      </div>
      <StatusBar />
    </div>
  );
}
