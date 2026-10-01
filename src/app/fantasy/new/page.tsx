import { NewFantasyMatchupForm } from "./NewFantasyMatchupForm";

export default function NewFantasyMatchupPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-lg font-semibold text-neutral-100">New Fantasy Matchup</h1>
      <NewFantasyMatchupForm />
    </div>
  );
}
