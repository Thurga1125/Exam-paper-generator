"use client";

import clsx from "clsx";
import {
  FileClock,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  LayoutTemplate,
  LibraryBig,
  LogOut,
  Menu,
  PlusCircle,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ToastProvider } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create", label: "Create New Paper", icon: PlusCircle },
  { href: "/resources", label: "My Resources", icon: FolderOpen },
  { href: "/past-papers", label: "Past Papers Library", icon: LibraryBig },
  { href: "/structures", label: "Structures & Templates", icon: LayoutTemplate },
  { href: "/papers", label: "Generated Papers", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ children, email }: { children: React.ReactNode; email: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
      {NAV.map((n) => {
        const active = path === n.href || (n.href !== "/dashboard" && path.startsWith(n.href + "/"));
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white/15 text-white" : "text-blue-100/80 hover:bg-white/10 hover:text-white",
            )}
          >
            <n.icon className="h-4 w-4 shrink-0" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const side = (
    <div className="flex h-full flex-col bg-navy-950">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
          <GraduationCap className="h-5 w-5" />
        </span>
        <span className="text-sm font-semibold leading-tight text-white">
          Smart Exam
          <br />
          Paper Studio
        </span>
      </div>
      {nav}
      <div className="border-t border-white/10 p-3">
        <p className="truncate px-3 pb-2 text-xs text-blue-100/60" title={email}>
          {email}
        </p>
        <form action="/auth/signout" method="post">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-blue-100/80 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="min-h-screen lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{side}</aside>

        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-1 hover:bg-slate-100">
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2 text-sm font-semibold text-navy-950">
            <FileClock className="h-4 w-4 text-brand-600" /> Smart Exam Paper Studio
          </span>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 shadow-xl">
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 z-10 rounded p-1 text-white hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
              {side}
            </div>
          </div>
        )}

        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
