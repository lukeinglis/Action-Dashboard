"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { persistWorkingState, saveAsNewView, saveView } from "./actions";
import { deepEqual } from "@/lib/dashboard/views";
import type { DashboardView, DashboardViewFilters, DashboardViewLayout, SortMode } from "@/lib/types/domain";
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

  function togglePane(pane: "what_do_i_need" | "fantasy" | "dfs") {
    updateLayout({ openPane: layout.openPane === pane ? undefined : pane });
  }

  function setScheduleGrouping(grouping: DashboardViewLayout["scheduleGrouping"]) {
    updateLayout({ scheduleGrouping: grouping });
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

  const openPane = layout.openPane;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-neutral-800 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-neutral-100">Dashboard</h1>
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
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/inbox"
            className="rounded bg-neutral-100 px-3 py-1.5 font-medium text-neutral-900 hover:bg-white"
          >
            + Add Pick
          </Link>
          <Link href="/events" className="text-neutral-300 underline">
            Events
          </Link>
          <Link href="/tickets" className="text-neutral-300 underline">
            Tickets
          </Link>
          <button
            type="button"
            onClick={() => togglePane("what_do_i_need")}
            className={`underline ${openPane === "what_do_i_need" ? "text-neutral-100" : "text-neutral-300"}`}
          >
            What Do I Need?
          </button>
          <button
            type="button"
            onClick={() => togglePane("fantasy")}
            className={`underline ${openPane === "fantasy" ? "text-neutral-100" : "text-neutral-300"}`}
          >
            Fantasy
          </button>
          <button
            type="button"
            onClick={() => togglePane("dfs")}
            className={`underline ${openPane === "dfs" ? "text-neutral-100" : "text-neutral-300"}`}
          >
            DFS
          </button>
          <form action={logout}>
            <button type="submit" className="text-neutral-500 underline">
              Sign out
            </button>
          </form>
        </nav>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 lg:grid lg:grid-cols-[280px_1fr_320px] lg:items-start lg:gap-4">
        <ScheduleRail
          events={props.scheduleEvents}
          grouping={layout.scheduleGrouping}
          onGroupingChange={setScheduleGrouping}
          selectedEventId={layout.activeWorkspace === "event" ? layout.selectedEventId ?? null : null}
          onSelect={selectEvent}
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

        {openPane === "what_do_i_need" && <WhatDoINeedPane entries={props.whatDoINeed} />}
        {openPane === "fantasy" && <FantasyPane items={props.fantasyMatchups} />}
        {openPane === "dfs" && <DFSPane items={props.dfsEntries} />}
      </div>
    </div>
  );
}
