import Link from "next/link";
import { NewDfsLineupForm } from "./NewDfsLineupForm";

export default function NewDfsLineupPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">New DFS Lineup</h1>
        <Link href="/" className="text-sm text-neutral-300 underline">
          Back to Dashboard
        </Link>
      </div>
      <NewDfsLineupForm />
    </div>
  );
}
