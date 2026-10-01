"use client";

import type { WhatDoINeedItem } from "./types";

export function WhatDoINeedPane({ entries }: { entries: WhatDoINeedItem[] }) {
  const groups: ("LIVE" | "UP NEXT")[] = ["LIVE", "UP NEXT"];

  return (
    <aside className="space-y-3 rounded-lg border border-neutral-800 p-3">
      <h2 className="text-sm font-semibold text-neutral-100">What Do I Need?</h2>
      {entries.length === 0 && <p className="text-xs text-neutral-500">Nothing live or up next.</p>}
      {groups.map((group) => {
        const groupEntries = entries.filter((e) => e.group === group);
        if (groupEntries.length === 0) return null;
        return (
          <div key={group}>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{group}</p>
            <ul className="space-y-1.5">
              {groupEntries.map((entry) => (
                <li key={entry.legId} className="text-xs text-neutral-300">
                  • {entry.description}
                  {entry.subjects.map((s) => (
                    <span key={s.name} className={s.label === "MIXED" ? "text-amber-300" : undefined}>
                      {" "}
                      — {s.name} {s.label}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </aside>
  );
}
