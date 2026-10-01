// Supabase access for Saved Views and Working State (docs/PRD.md sections
// 46, 46.1). Pure DB plumbing — the restore/eligibility logic lives in
// views.ts and stays unit-testable without a client.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  toDashboardView,
  toWorkspaceState,
  type DashboardViewRow,
  type WorkspaceStateRow,
} from "@/lib/db/rows";
import type { DashboardView, DashboardViewFilters, DashboardViewLayout, WorkspaceState } from "@/lib/types/domain";
import { DEFAULT_VIEW_NAME, defaultViewFilters, defaultViewLayout } from "./views";

/** Reads the user's default "Active" View, creating it on first access. */
export async function getOrCreateDefaultView(supabase: SupabaseClient, userId: string): Promise<DashboardView> {
  const { data, error } = await supabase
    .from("dashboard_views")
    .select("*")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw error;
  if (data) return toDashboardView(data as DashboardViewRow);

  const { data: created, error: insertError } = await supabase
    .from("dashboard_views")
    .insert({
      user_id: userId,
      name: DEFAULT_VIEW_NAME,
      is_default: true,
      filters: defaultViewFilters(),
      layout: defaultViewLayout(),
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return toDashboardView(created as DashboardViewRow);
}

export async function listViews(supabase: SupabaseClient, userId: string): Promise<DashboardView[]> {
  const { data, error } = await supabase
    .from("dashboard_views")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toDashboardView(row as DashboardViewRow));
}

export async function getView(supabase: SupabaseClient, viewId: string): Promise<DashboardView | null> {
  const { data, error } = await supabase.from("dashboard_views").select("*").eq("id", viewId).maybeSingle();
  if (error) throw error;
  return data ? toDashboardView(data as DashboardViewRow) : null;
}

export async function createView(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  filters: DashboardViewFilters,
  layout: DashboardViewLayout,
): Promise<DashboardView> {
  const { data, error } = await supabase
    .from("dashboard_views")
    .insert({ user_id: userId, name, is_default: false, filters, layout })
    .select("*")
    .single();
  if (error) throw error;
  return toDashboardView(data as DashboardViewRow);
}

/** Overwrites a View's filters/layout ("Save"). */
export async function updateView(
  supabase: SupabaseClient,
  viewId: string,
  filters: DashboardViewFilters,
  layout: DashboardViewLayout,
): Promise<DashboardView> {
  const { data, error } = await supabase
    .from("dashboard_views")
    .update({ filters, layout })
    .eq("id", viewId)
    .select("*")
    .single();
  if (error) throw error;
  return toDashboardView(data as DashboardViewRow);
}

export async function getWorkspaceState(supabase: SupabaseClient, userId: string): Promise<WorkspaceState | null> {
  const { data, error } = await supabase.from("workspace_state").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? toWorkspaceState(data as WorkspaceStateRow) : null;
}

/** Saved on every change (docs/PRD.md section 46.1): upserts the single working-state row for the user. */
export async function saveWorkspaceState(
  supabase: SupabaseClient,
  userId: string,
  baseViewId: string | null,
  filters: DashboardViewFilters,
  layout: DashboardViewLayout,
): Promise<WorkspaceState> {
  const { data, error } = await supabase
    .from("workspace_state")
    .upsert({ user_id: userId, base_view_id: baseViewId, filters, layout }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return toWorkspaceState(data as WorkspaceStateRow);
}
