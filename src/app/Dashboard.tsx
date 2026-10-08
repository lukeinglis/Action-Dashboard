"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { persistWorkingState, saveAsNewView, saveView } from "./actions";
import { deepEqual } from "@/lib/dashboard/views";
import type {
  DashboardPane,
  DashboardView,
  DashboardViewFilters,
  DashboardViewLayout,
  SortMode,
  SportsRefreshState,
} from "@/lib/types/domain";
import type {
  DashboardTicketItem,
  DfsEntryPaneItem,
  EventDetailData,
  FantasyMatchupPaneItem,
  ScheduleEventItem,
  WhatDoINeedItem,
} from "./types";
import { ScheduleRail } from "./ScheduleRail";
import { MainWorkspace } from "./MainWorkspace";
import { WhatDoINeedPane } from "./WhatDoINeedPane";
import { FantasyPane } from "./FantasyPane";
import { DFSPane } from "./DFSPane";
import { ViewSwitcher } from "./ViewSwitcher";
import { RefreshControl } from "./RefreshControl";

const PANES: { value: DashboardPane; label: string }[] = [
  { value: "what_do_i_need", label: "What Do I Need?" },
  { value: "fantasy", label: "Fantasy" },
  { value: "dfs", label: "DFS" },
];

interface Props {
  baseViewId: string | null;
  initialFilters: DashboardViewFilters;
  initialLayout: DashboardViewLayout;
  views: DashboardView[];
  scheduleEvents: ScheduleEventItem[];
  ticketItems: DashboardTicketItem[];
  eventDetailByEventId: Record<string, EventDetailData>;
  whatDoINeed: WhatDoINeedItem[];
  fantasyMatchups: FantasyMatchupPaneItem[];
  dfsEntries: DfsEntryPaneItem[];
  timeZone: string;
  /** Per provider + sport freshness for the refresh control (§21). */
  refreshStates: SportsRefreshState[];
  staleOverrideCount: number;
  unsupportedSports: string[];
}

export function Dashboard(props: Props) {
  const [baseViewId, setBaseViewId] = useState(props.baseViewId);
  const [filters, setFilters] = useState(props.initialFilters);
  const [layout, setLayout] = useState(props.initialLayout);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function persist(nextFilters: DashboardViewFilters, nextLayout: DashboardViewLayout, activeBaseViewId: string | null) {
    startTransition(() => {
      void persistWorkingState(activeBaseViewId, nextFilters, nextLayout);
    });
  }

  function updateLayout(patch: Partial<DashboardViewLayout>) {
    const next = { ...layout, ...patch };
    setLayout(next);
    persist(filters, next, baseViewId);
  }

  function selectEvent(eventId: string | null) {
    updateLayout(
      eventId
        ? { activeWorkspace: "event", selectedEventId: eventId }
        : { activeWorkspace: "tickets", selectedEventId: undefined },
    );
  }

  function setSortMode(mode: SortMode) {
    updateLayout({ sortMode: mode });
  }

  function togglePane(pane: DashboardPane) {
    const current = layout.openPanes ?? [];
    updateLayout({
      openPanes: current.includes(pane) ? current.filter((p) => p !== pane) : [...current, pane],
    });
  }

  function setScheduleGrouping(grouping: DashboardViewLayout["scheduleGrouping"]) {
    updateLayout({ scheduleGrouping: grouping });
  }

  function toggleExpandedEvent(eventId: string) {
    const current = layout.expandedEventIds ?? [];
    updateLayout({
      expandedEventIds: current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId],
    });
  }

  const baseView = props.views.find((v) => v.id === baseViewId) ?? null;
  const isModified = baseView ? !deepEqual(baseView.filters, filters) || !deepEqual(baseView.layout, layout) : false;

  function switchView(viewId: string) {
    const view = props.views.find((v) => v.id === viewId);
    if (!view) return;
    setBaseViewId(view.id);
    setFilters(view.filters);
    setLayout(view.layout);
    startTransition(async () => {
      await persistWorkingState(view.id, view.filters, view.layout);
      router.refresh();
    });
  }

  function revert() {
    if (!baseView) return;
    setFilters(baseView.filters);
    setLayout(baseView.layout);
    persist(baseView.filters, baseView.layout, baseView.id);
  }

  function save() {
    if (!baseView) return;
    startTransition(async () => {
      await saveView(baseView.id, filters, layout);
      router.refresh();
    });
  }

  function saveAsNew() {
    const name = window.prompt("New View name");
    if (!name) return;
    startTransition(async () => {
      const view = await saveAsNewView(name, filters, layout);
      setBaseViewId(view.id);
      router.refresh();
    });
  }

  const selectedEventDetail = useMemo(
    () => (layout.selectedEventId ? props.eventDetailByEventId[layout.selectedEventId] ?? null : null),
    [layout.selectedEventId, props.eventDetailByEventId],
  );

  const openPanes = layout.openPanes ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-900/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-neutral-100">Action</h1>
            <span aria-hidden className="text-neutral-700">
              /
            </span>
            <ViewSwitcher
              views={props.views}
              baseViewId={baseViewId}
              isModified={isModified}
              onSwitch={switchView}
              onSave={save}
              onSaveAsNew={saveAsNew}
              onRevert={revert}
            />
          </div>

          <div className="ml-auto flex items-center gap-3 text-xs">
            <RefreshControl
              refreshStates={props.refreshStates}
              staleOverrideCount={props.staleOverrideCount}
              unsupportedSports={props.unsupportedSports}
              timeZone={props.timeZone}
            />
            <nav aria-label="Library" className="flex items-center gap-1">
              <Link
                href="/events"
                className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              >
                Events
              </Link>
              <Link
                href="/tickets"
                className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              >
                Tickets
              </Link>
            </nav>
            <Link
              href="/inbox"
              className="rounded-md bg-neutral-100 px-2.5 py-1.5 font-semibold text-neutral-900 hover:bg-white"
            >
              + Add Pick
            </Link>
            <form action={logout} className="border-l border-neutral-800 pl-3">
              <button type="submit" className="text-neutral-600 hover:text-neutral-300">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* Pane toggles sit apart from navigation: they open a column here, they don't leave the page. */}
        <div className="flex items-center gap-2 border-t border-neutral-800/60 px-4 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Panes</span>
          <div className="flex items-center gap-1">
            {PANES.map((pane) => {
              const isOpen = openPanes.includes(pane.value);
              return (
                <button
                  key={pane.value}
                  type="button"
                  onClick={() => togglePane(pane.value)}
                  aria-pressed={isOpen}
                  className={`rounded px-2 py-0.5 text-[11px] ${
                    isOpen
                      ? "bg-neutral-100 font-medium text-neutral-900"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  }`}
                >
                  {pane.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 lg:grid lg:grid-cols-[280px_1fr_320px] lg:items-start lg:gap-4">
        <ScheduleRail
          events={props.scheduleEvents}
          grouping={layout.scheduleGrouping}
          onGroupingChange={setScheduleGrouping}
          selectedEventId={layout.activeWorkspace === "event" ? layout.selectedEventId ?? null : null}
          onSelect={selectEvent}
          expandedEventIds={layout.expandedEventIds ?? []}
          onToggleExpanded={toggleExpandedEvent}
          eventDetailByEventId={props.eventDetailByEventId}
          timeZone={props.timeZone}
        />

        <MainWorkspace
          activeWorkspace={layout.activeWorkspace}
          sortMode={layout.sortMode}
          onSortModeChange={setSortMode}
          ticketItems={props.ticketItems}
          selectedEventDetail={selectedEventDetail}
          onBackToTickets={() => selectEvent(null)}
        />

        {openPanes.length > 0 && (
          <div className="space-y-4">
            {openPanes.includes("what_do_i_need") && <WhatDoINeedPane entries={props.whatDoINeed} />}
            {openPanes.includes("fantasy") && (
              <FantasyPane items={props.fantasyMatchups} onSelectEvent={selectEvent} />
            )}
            {openPanes.includes("dfs") && <DFSPane items={props.dfsEntries} onSelectEvent={selectEvent} />}
          </div>
        )}
      </div>
    </div>
  );
}
