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
    <div className="flex items-center gap-2 text-sm">
      <select
        value={baseViewId ?? ""}
        onChange={(e) => onSwitch(e.target.value)}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300"
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
          <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs text-amber-300">Modified</span>
          <button type="button" onClick={onSave} className="text-neutral-300 underline">
            Save
          </button>
          <button type="button" onClick={onSaveAsNew} className="text-neutral-300 underline">
            Save as New View
          </button>
          <button type="button" onClick={onRevert} className="text-neutral-300 underline">
            Revert
          </button>
        </>
      )}
    </div>
  );
}
