"use client";

import { useEffect, useRef, useState } from "react";
import { BellIcon } from "./icons";
import type { ActivityItem } from "@/lib/database/activity";

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

function isToday(iso: string): boolean {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function NotificationCenter({ items }: { items: ActivityItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const todayItems = items.filter((item) => isToday(item.createdAt));
  const earlierItems = items.filter((item) => !isToday(item.createdAt));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
      >
        <BellIcon className="h-5 w-5" />
        {items.length > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
            {items.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200
            bg-white shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-80"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Recent Activity</p>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No recent activity.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayItems.length > 0 && (
                <div>
                  <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Today</p>
                  {todayItems.map((item) => (
                    <div key={item.id} className="px-4 py-2.5">
                      <p className="text-sm text-slate-700">{item.description}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{formatTime(item.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}

              {earlierItems.length > 0 && (
                <div>
                  <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Earlier</p>
                  {earlierItems.map((item) => (
                    <div key={item.id} className="px-4 py-2.5">
                      <p className="text-sm text-slate-700">{item.description}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{formatTime(item.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
