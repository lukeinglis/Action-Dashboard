import { NewTicketForm } from "./NewTicketForm";

export default function NewTicketPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-lg font-semibold text-neutral-100">New Ticket</h1>
      <NewTicketForm />
    </div>
  );
}
