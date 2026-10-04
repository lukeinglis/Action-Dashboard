import Link from "next/link";
import { NewTicketForm } from "./NewTicketForm";

export default function NewTicketPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">New Ticket</h1>
        <Link href="/tickets" className="text-sm text-neutral-300 underline">
          Back to Tickets
        </Link>
      </div>
      <NewTicketForm />
    </div>
  );
}
