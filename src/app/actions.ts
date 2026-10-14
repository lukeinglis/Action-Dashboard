"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createView as createViewDb,
  getWorkspaceState,
  getOrCreateDefaultView,
  saveWorkspaceState,
  updateView as updateViewDb,
} from "@/lib/dashboard/views-db";
import { resolveDateWindow } from "@/lib/dashboard/date-window";
import { resolveOpeningState } from "@/lib/dashboard/views";
import { getUserPreferences } from "@/lib/preferences/get-user-preferences";
import { EspnProvider } from "@/lib/providers/espn";
import { SleeperProvider } from "@/lib/providers/sleeper";
import { loadRefreshScope } from "@/lib/sports/refresh-scope-db";
import { refreshSportsData } from "@/lib/sports/refresh";
import { loadRepairableLegs, repairLegs, type RepairLegsResult } from "@/lib/betting/repair-legs";
import { fetchMatchCandidates } from "@/lib/import/candidates";
import type { DashboardView, DashboardViewFilters, DashboardViewLayout, WorkspaceState } from "@/lib/types/domain";
import type { RefreshSportsResult } from "./types";

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

/** Persists the working state on every dashboard change (docs/PRD.md section 46.1). */
export async function persistWorkingState(
  baseViewId: string | null,
  filters: DashboardViewFilters,
  layout: DashboardViewLayout,
): Promise<WorkspaceState> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const state = await saveWorkspaceState(supabase, userId, baseViewId, filters, layout);
  revalidatePath("/");
  return state;
}

/** "Save": overwrites the base View with the current working state. */
export async function saveView(
  viewId: string,
  filters: DashboardViewFilters,
  layout: DashboardViewLayout,
): Promise<DashboardView> {
  const supabase = await createClient();
  await requireUserId(supabase);
  const view = await updateViewDb(supabase, viewId, filters, layout);
  revalidatePath("/");
  return view;
}

/** "Save as New View": creates a View from the current working state and rebases onto it. */
export async function saveAsNewView(
  name: string,
  filters: DashboardViewFilters,
  layout: DashboardViewLayout,
): Promise<DashboardView> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const view = await createViewDb(supabase, userId, name, filters, layout);
  await saveWorkspaceState(supabase, userId, view.id, filters, layout);
  revalidatePath("/");
  return view;
}

/**
 * The `↻ Refresh Sports Data` control (docs/PRD.md §22). Refresh is manual by
 * design (§5.4), so this is the only thing that pulls provider data.
 *
 * Scope is resolved on the server from the user's own exposure rather than
 * taken from the client: the client would otherwise get to decide how much of
 * the daily quota to spend, and the dashboard the user is looking at is already
 * the authoritative statement of what is relevant.
 *
 * Never throws for a provider failure — §22 requires a failed refresh to retain
 * prior data and surface a non-blocking error, so every sport comes back with a
 * status instead.
 */
export async function refreshSports(): Promise<RefreshSportsResult> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  const [preferences, defaultView, workspaceState] = await Promise.all([
    getUserPreferences(supabase, userId),
    // The create half is dead weight here — the dashboard has to have rendered
    // for this button to exist — but it is idempotent, and it is what guarantees
    // a View to fall back to.
    getOrCreateDefaultView(supabase, userId),
    getWorkspaceState(supabase, userId),
  ]);

  const now = new Date();
  const { timezone, rolloverHour } = preferences;

  // Resolved the same way the page does, so refresh scope and what is on screen
  // cannot drift apart. It reads the *persisted* working state (§46.1), which
  // the dashboard writes on every change: a filter edited and refreshed in the
  // same instant can use the previous filters, which costs one stale refresh
  // and corrects itself on the next.
  const opening = resolveOpeningState(workspaceState, defaultView, now, timezone, rolloverHour);
  const dateWindow = resolveDateWindow(opening.filters.dateWindow, now, timezone, rolloverHour);

  const { scopes, unsupportedSports } = await loadRefreshScope(supabase, {
    userId,
    timeZone: timezone,
    rolloverHour,
    filters: opening.filters,
    dateWindow,
    now,
  });

  // Before grading, not after. A leg's Event link and Subjects are proposed
  // once at import approval and never revisited, so a matcher fix never reaches
  // rows already saved — and one of those bugs stored the *backed* team as
  // "against", which grades a win as a loss. Repairing first is what keeps this
  // press from writing a confidently wrong settlement over the user's data.
  const legRepair = await repairImportedLegs(supabase, userId, timezone);

  const result = await refreshSportsData(supabase, {
    userId,
    timeZone: timezone,
    provider: EspnProvider,
    // Scores come from ESPN, player stat lines from Sleeper (§30). Both are
    // free; Sleeper answers for every NFL player in one call, so adding it
    // costs a flat two requests rather than one per prop.
    statsProvider: SleeperProvider,
    scopes,
  });

  revalidatePath("/");
  return { ...result, unsupportedSports, legRepair };
}

/**
 * Re-derives saved legs' Event links and Subjects from the slip text they were
 * imported from (see `repairLegs`).
 *
 * Swallows its own failure for the same reason the provider calls do (§22): a
 * refresh that cannot repair must still fetch scores and leave the dashboard
 * usable. Returning a zeroed result reports "nothing repaired", which is the
 * truth, rather than claiming a fix that did not happen.
 */
async function repairImportedLegs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  timeZone: string,
): Promise<RepairLegsResult> {
  try {
    const [legs, candidates] = await Promise.all([
      loadRepairableLegs(supabase, userId),
      fetchMatchCandidates(supabase, userId),
    ]);
    return await repairLegs(supabase, userId, legs, { candidates, timeZone });
  } catch {
    return { legsRepaired: 0, eventsLinked: 0, subjectsWritten: 0, futures: 0, unresolved: 0 };
  }
}
