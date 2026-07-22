"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ExpenseForm, ExpenseFormPayload } from "@/components/expense-form";

interface Trip {
  _id: string;
  name: string;
  participants: string[];
}

interface ExpenseResponse {
  _id: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  splitAmong: string[];
  date: string;
  category?: string;
}

export default function EditExpensePage() {
  const router = useRouter();
  const params = useParams<{ id: string; expenseId: string }>();
  const tripId = params.id;
  const expenseId = params.expenseId;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [expense, setExpense] = useState<ExpenseResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [tripRes, expenseRes] = await Promise.all([
          fetch(`/api/trips/${tripId}`),
          fetch(`/api/expenses/${expenseId}`),
        ]);

        if (!tripRes.ok) {
          const tripData = await tripRes.json();
          setError(tripData.error ?? "Failed to load trip");
          return;
        }

        if (!expenseRes.ok) {
          const expenseData = await expenseRes.json();
          setError(expenseData.error ?? "Failed to load expense");
          return;
        }

        const [tripData, expenseData] = await Promise.all([
          tripRes.json(),
          expenseRes.json(),
        ]);

        setTrip(tripData);
        setExpense(expenseData);
      } catch {
        setError("Failed to load data");
      }
    }

    loadData();
  }, [tripId, expenseId]);

  async function handleUpdate(payload: ExpenseFormPayload) {
    const res = await fetch(`/api/expenses/${expenseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return data.error ?? "Failed to update expense";
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
            Edit Expense
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

        {!error && trip && expense ? (
          <ExpenseForm
            participants={trip.participants}
            initialValues={{
              description: expense.description,
              amount: expense.amount,
              currency: expense.currency,
              paidBy: expense.paidBy,
              splitAmong: expense.splitAmong,
              date: expense.date,
              category: expense.category ?? "",
            }}
            submitLabel="Save Changes"
            submittingLabel="Saving…"
            onSubmit={handleUpdate}
          />
        ) : !error ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading expense...</p>
        ) : null}
      </main>
    </div>
  );
}
