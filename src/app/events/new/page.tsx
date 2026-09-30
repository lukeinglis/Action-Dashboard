import { createClient } from "@/lib/supabase/server";
import { toTeam, type TeamRow } from "@/lib/db/rows";
import { NewEventForm } from "./NewEventForm";

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("teams").select("*").order("name");
  if (error) throw error;

  const teams = (data ?? []).map((row) => toTeam(row as TeamRow));

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-lg font-semibold text-neutral-100">New Event</h1>
      <NewEventForm teams={teams} />
    </div>
  );
}
