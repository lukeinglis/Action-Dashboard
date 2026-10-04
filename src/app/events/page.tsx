import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { toEvent, type EventRow } from "@/lib/db/rows";
import { logout } from "@/app/login/actions";
import { EventCard } from "./EventCard";

export default async function EventsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_time_utc", { ascending: true, nullsFirst: false });

  if (error) throw error;

  const events = (data ?? []).map((row) => toEvent(row as EventRow));

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-neutral-100">Events</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="text-sm text-neutral-300 underline">
            Dashboard
          </Link>
          <Link href="/tickets" className="text-sm text-neutral-300 underline">
            Tickets
          </Link>
          <Link href="/inbox" className="text-sm text-neutral-300 underline">
            Inbox
          </Link>
          <Link href="/events/new" className="text-sm text-neutral-300 underline">
            New Event
          </Link>
          <form action={logout}>
            <button type="submit" className="text-sm text-neutral-500 underline">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {events.length === 0 && (
        <p className="text-sm text-neutral-500">No events yet.</p>
      )}

      <div className="space-y-3">
        {events.map((event) => (
          <EventCard key={event.id} event={event} allEvents={events} />
        ))}
      </div>
    </div>
  );
}
