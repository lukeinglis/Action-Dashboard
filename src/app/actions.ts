"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createView as createViewDb,
  saveWorkspaceState,
  updateView as updateViewDb,
} from "@/lib/dashboard/views-db";
import type { DashboardView, DashboardViewFilters, DashboardViewLayout, WorkspaceState } from "@/lib/types/domain";

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
