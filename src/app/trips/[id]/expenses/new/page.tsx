"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ExpenseForm, ExpenseFormPayload } from "@/components/expense-form";

interface Trip {
  _id: string;
  name: string;
  participants: string[];
}

export default function NewExpensePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const tripId = params.id;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/trips/${tripId}`)
      .then((r) => r.json())
      .then((data) => {
        setTrip(data);
      })
      .catch(() => setError("Failed to load trip"));
  }, [tripId]);

  async function handleCreate(payload: ExpenseFormPayload) {
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId,
        ...payload,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return data.error ?? "Failed to create expense";
    }

    router.push(`/trips/${tripId}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 font-sans">
      <header className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href={`/trips/${tripId}`}
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors"
          >
            ← {trip?.name ?? "Trip"}
          </Link>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Add Expense
          </h1>
          <span />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">
        {error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400 mb-5">
            {error}
          </p>
        )}

        {!error && trip ? (
          <ExpenseForm
            participants={trip.participants}
            submitLabel="Add Expense"
            submittingLabel="Adding…"
            onSubmit={handleCreate}
          />
        ) : !error ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading trip...</p>
        ) : null}
      </main>
    </div>
  );
}
