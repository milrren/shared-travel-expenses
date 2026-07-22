import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { Trip } from "@/types";

async function getTrips(): Promise<Trip[]> {
  try {
    const db = await getDb();
    return db
      .collection<Trip>("trips")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
  } catch {
    return [];
  }
}

export default async function Home() {
  const trips = await getTrips();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 font-sans">
      <header className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            ✈️ Shared Travel Expenses
          </h1>
          <Link
            href="/trips/new"
            className="rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            + New Trip
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-100 mb-6">
          Your Trips
        </h2>

        {trips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 p-16 text-center">
            <p className="text-zinc-500 dark:text-zinc-400 text-lg mb-4">
              No trips yet. Create your first one!
            </p>
            <Link
              href="/trips/new"
              className="inline-block rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 px-6 py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              + New Trip
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {trips.map((trip) => (
              <li key={String(trip._id)}>
                <Link
                  href={`/trips/${trip._id}`}
                  className="block rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
                >
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 text-lg mb-1">
                    {trip.name}
                  </h3>
                  {trip.description && (
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-2 line-clamp-2">
                      {trip.description}
                    </p>
                  )}
                  <p className="text-zinc-400 dark:text-zinc-500 text-xs">
                    {trip.startDate}
                    {trip.endDate ? ` → ${trip.endDate}` : ""}
                  </p>
                  <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1">
                    {trip.participants.join(", ")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
