"use client";

import type { DashboardView } from "@/lib/types/domain";

interface Props {
  views: DashboardView[];
  baseViewId: string | null;
  isModified: boolean;
  onSwitch: (viewId: string) => void;
  onSave: () => void;
  onSaveAsNew: () => void;
  onRevert: () => void;
}

export function ViewSwitcher({ views, baseViewId, isModified, onSwitch, onSave, onSaveAsNew, onRevert }: Props) {
  const baseView = views.find((v) => v.id === baseViewId) ?? null;

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Dashboard view"
        value={baseViewId ?? ""}
        onChange={(e) => onSwitch(e.target.value)}
        className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-300"
      >
        {!baseView && <option value="">(unsaved)</option>}
        {views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>

      {isModified && (
        <>
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Modified
          </span>
          <button
            type="button"
            onClick={onSave}
            className="rounded px-1.5 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onSaveAsNew}
            className="rounded px-1.5 py-0.5 text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            Save as New
          </button>
          <button
            type="button"
            onClick={onRevert}
            className="rounded px-1.5 py-0.5 text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            Revert
          </button>
        </>
      )}
    </div>
  );
}
