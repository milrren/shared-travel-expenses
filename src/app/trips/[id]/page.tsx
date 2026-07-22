import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { Trip, Expense } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getTrip(id: string): Promise<Trip | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db.collection<Trip>("trips").findOne({ _id: new ObjectId(id) });
}

async function getExpenses(tripId: string): Promise<Expense[]> {
  if (!ObjectId.isValid(tripId)) return [];
  const db = await getDb();
  return db
    .collection<Expense>("expenses")
    .find({ tripId: new ObjectId(tripId) })
    .sort({ date: -1 })
    .toArray();
}

function computeBalances(
  expenses: Expense[],
  participants: string[]
): Map<string, Map<string, number>> {
  // owes[debtor][creditor] = amount
  const owes = new Map<string, Map<string, number>>();
  for (const p of participants) owes.set(p, new Map());

  for (const expense of expenses) {
    if (expense.splitAmong.length === 0) continue;
    const share = expense.amount / expense.splitAmong.length;
    for (const person of expense.splitAmong) {
      if (person === expense.paidBy) continue;
      const personOwes = owes.get(person) ?? new Map<string, number>();
      const current = personOwes.get(expense.paidBy) ?? 0;
      personOwes.set(expense.paidBy, current + share);
      owes.set(person, personOwes);
    }
  }
  return owes;
}

export default async function TripPage({ params }: PageProps) {
  const { id } = await params;
  const [trip, expenses] = await Promise.all([getTrip(id), getExpenses(id)]);

  if (!trip) notFound();

  const balances = computeBalances(expenses, trip.participants);
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 font-sans">
      <header className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors"
          >
            ← All Trips
          </Link>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {trip.name}
          </h1>
          <span className="text-sm text-zinc-400 dark:text-zinc-500">
            {trip.startDate}
            {trip.endDate ? ` → ${trip.endDate}` : ""}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 grid gap-10 lg:grid-cols-3">
        {/* Expenses list */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
              Expenses
            </h2>
            <Link
              href={`/trips/${id}/expenses/new`}
              className="rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 px-4 py-1.5 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              + Add Expense
            </Link>
          </div>

          {expenses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 p-10 text-center text-zinc-500 dark:text-zinc-400">
              No expenses yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {expenses.map((expense) => (
                <li
                  key={String(expense._id)}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-5 py-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">
                      {expense.description}
                    </span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                      {expense.currency} {expense.amount.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Paid by <strong>{expense.paidBy}</strong> · Split among{" "}
                    {expense.splitAmong.join(", ")} · {expense.date}
                  </p>
                  {expense.category && (
                    <span className="inline-block mt-2 rounded-full bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {expense.category}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {expenses.length > 0 && (
            <p className="mt-4 text-right text-sm text-zinc-500 dark:text-zinc-400">
              Total: {expenses[0]?.currency ?? ""}{" "}
              <strong>{totalAmount.toFixed(2)}</strong>
            </p>
          )}
        </section>

        {/* Sidebar */}
        <aside className="flex flex-col gap-6">
          {/* Participants */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
              Participants
            </h3>
            <ul className="flex flex-col gap-1">
              {trip.participants.map((p) => (
                <li
                  key={p}
                  className="text-sm text-zinc-700 dark:text-zinc-300"
                >
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Balances */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
              Balances
            </h3>
            {Array.from(balances.entries()).every(
              ([, creditors]) => creditors.size === 0
            ) ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                All settled up!
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {Array.from(balances.entries()).map(([debtor, creditors]) =>
                  Array.from(creditors.entries()).map(([creditor, amount]) =>
                    amount > 0.005 ? (
                      <li
                        key={`${debtor}-${creditor}`}
                        className="text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        <strong>{debtor}</strong> owes{" "}
                        <strong>{creditor}</strong>{" "}
                        {expenses[0]?.currency ?? ""} {amount.toFixed(2)}
                      </li>
                    ) : null
                  )
                )}
              </ul>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
