import { NewDfsLineupForm } from "./NewDfsLineupForm";

export default function NewDfsLineupPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-lg font-semibold text-neutral-100">New DFS Lineup</h1>
      <NewDfsLineupForm />
    </div>
  );
}
