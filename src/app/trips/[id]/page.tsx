import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { Trip, Expense, ExpenseSplitShare } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
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

interface Settlement {
  from: string;
  to: string;
  amount: number;
}

interface NormalizedSplitShare {
  participant: string;
  cents: number;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function isSplitShare(value: unknown): value is ExpenseSplitShare {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.participant === "string" &&
    candidate.participant.trim().length > 0 &&
    typeof candidate.amount === "number" &&
    Number.isFinite(candidate.amount) &&
    candidate.amount > 0
  );
}

function normalizeSplitShares(expense: Expense): {
  shares: NormalizedSplitShare[];
  isCustom: boolean;
} {
  const splitAmong = expense.splitAmong;

  if (!Array.isArray(splitAmong) || splitAmong.length === 0) {
    return { shares: [], isCustom: false };
  }

  if (splitAmong.every((value) => typeof value === "string")) {
    const participants = splitAmong as string[];
    const totalCents = toCents(expense.amount);
    const splitCount = participants.length;
    const baseShare = Math.floor(totalCents / splitCount);
    const remainder = totalCents - baseShare * splitCount;

    const shares = participants.map((participant, index) => ({
      participant,
      cents: baseShare + (index < remainder ? 1 : 0),
    }));

    return { shares, isCustom: false };
  }

  if (splitAmong.every((value) => isSplitShare(value))) {
    const totalCents = toCents(expense.amount);
    const shares = (splitAmong as ExpenseSplitShare[]).map((share) => ({
      participant: share.participant,
      cents: toCents(share.amount),
    }));

    const assignedCents = shares.reduce((sum, share) => sum + share.cents, 0);
    const delta = totalCents - assignedCents;
    if (shares.length > 0 && delta !== 0) {
      shares[0] = { ...shares[0], cents: shares[0].cents + delta };
    }

    return { shares, isCustom: true };
  }

  return { shares: [], isCustom: false };
}

function formatSplitSummary(expense: Expense): string {
  const normalized = normalizeSplitShares(expense);
  if (normalized.shares.length === 0) {
    return "No participants";
  }

  if (!normalized.isCustom) {
    return normalized.shares.map((share) => share.participant).join(", ");
  }

  return normalized.shares
    .map(
      (share) => `${share.participant} ${expense.currency} ${(share.cents / 100).toFixed(2)}`
    )
    .join(", ");
}

function computeSettlements(
  expenses: Expense[],
  participants: string[]
): Settlement[] {
  const netByParticipant = new Map<string, number>();
  for (const participant of participants) {
    netByParticipant.set(participant, 0);
  }

  const addNet = (person: string, deltaCents: number) => {
    netByParticipant.set(
      person,
      (netByParticipant.get(person) ?? 0) + deltaCents
    );
  };

  for (const expense of expenses) {
    const { shares } = normalizeSplitShares(expense);
    if (shares.length === 0) continue;

    const totalCents = toCents(expense.amount);
    addNet(expense.paidBy, totalCents);

    for (const share of shares) {
      addNet(share.participant, -share.cents);
    }
  }

  const debtors = Array.from(netByParticipant.entries())
    .filter(([, cents]) => cents < 0)
    .map(([person, cents]) => ({ person, cents: -cents }));

  const creditors = Array.from(netByParticipant.entries())
    .filter(([, cents]) => cents > 0)
    .map(([person, cents]) => ({ person, cents }));

  const settlements: Settlement[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort((a, b) => b.cents - a.cents);
    creditors.sort((a, b) => b.cents - a.cents);

    const topDebtor = debtors[0];
    const topCreditor = creditors[0];
    const transferCents = Math.min(topDebtor.cents, topCreditor.cents);

    settlements.push({
      from: topDebtor.person,
      to: topCreditor.person,
      amount: transferCents / 100,
    });

    topDebtor.cents -= transferCents;
    topCreditor.cents -= transferCents;

    if (topDebtor.cents === 0) debtors.shift();
    if (topCreditor.cents === 0) creditors.shift();
  }

  return settlements;
}

function computePairwiseSettlements(
  expenses: Expense[],
  participants: string[]
): Settlement[] {
  const owes = new Map<string, Map<string, number>>();
  for (const participant of participants) {
    owes.set(participant, new Map());
  }

  const addOwe = (debtor: string, creditor: string, cents: number) => {
    const debtorMap = owes.get(debtor) ?? new Map<string, number>();
    debtorMap.set(creditor, (debtorMap.get(creditor) ?? 0) + cents);
    owes.set(debtor, debtorMap);
  };

  for (const expense of expenses) {
    const { shares } = normalizeSplitShares(expense);
    if (shares.length === 0) continue;

    for (const share of shares) {
      if (share.participant === expense.paidBy) continue;
      addOwe(share.participant, expense.paidBy, share.cents);
    }
  }

  const settlements: Settlement[] = [];
  for (let i = 0; i < participants.length; i += 1) {
    for (let j = i + 1; j < participants.length; j += 1) {
      const a = participants[i];
      const b = participants[j];
      const aOwesB = owes.get(a)?.get(b) ?? 0;
      const bOwesA = owes.get(b)?.get(a) ?? 0;

      if (aOwesB > bOwesA) {
        settlements.push({ from: a, to: b, amount: (aOwesB - bOwesA) / 100 });
      } else if (bOwesA > aOwesB) {
        settlements.push({ from: b, to: a, amount: (bOwesA - aOwesB) / 100 });
      }
    }
  }

  return settlements;
}

export default async function TripPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { mode } = await searchParams;
  const balanceMode =
    mode === "pairwise" || mode === "compare" ? mode : "global";
  const [trip, expenses] = await Promise.all([getTrip(id), getExpenses(id)]);

  if (!trip) notFound();

  const simplifiedSettlements = computeSettlements(expenses, trip.participants);
  const pairwiseSettlements = computePairwiseSettlements(
    expenses,
    trip.participants
  );
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
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                        {expense.currency} {expense.amount.toFixed(2)}
                      </span>
                      <Link
                        href={`/trips/${id}/expenses/${String(expense._id)}/edit`}
                        className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Paid by <strong>{expense.paidBy}</strong> · Split among{" "}
                    {formatSplitSummary(expense)} · {expense.date}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {expense.category && (
                      <span className="inline-block rounded-full bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                        {expense.category}
                      </span>
                    )}
                    {normalizeSplitShares(expense).isCustom && (
                      <span className="inline-block rounded-full bg-sky-100 dark:bg-sky-900/40 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-300">
                        Divisao personalizada
                      </span>
                    )}
                  </div>
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
            <div className="mb-4 flex flex-wrap gap-2">
              <Link
                href={`/trips/${id}?mode=global`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  balanceMode === "global"
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                }`}
              >
                Global Simplified
              </Link>
              <Link
                href={`/trips/${id}?mode=pairwise`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  balanceMode === "pairwise"
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                }`}
              >
                Pair-wise Netting
              </Link>
              <Link
                href={`/trips/${id}?mode=compare`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  balanceMode === "compare"
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                }`}
              >
                Compare
              </Link>
            </div>

            {simplifiedSettlements.length === 0 && pairwiseSettlements.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                All settled up!
              </p>
            ) : balanceMode === "global" ? (
              simplifiedSettlements.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  All settled up.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {simplifiedSettlements.map((settlement, index) => (
                    <li
                      key={`global-${settlement.from}-${settlement.to}-${index}`}
                      className="text-sm text-zinc-700 dark:text-zinc-300"
                    >
                      <strong>{settlement.from}</strong> owes{" "}
                      <strong>{settlement.to}</strong>{" "}
                      {expenses[0]?.currency ?? ""} {settlement.amount.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )
            ) : balanceMode === "pairwise" ? (
              pairwiseSettlements.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  All settled up.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {pairwiseSettlements.map((settlement, index) => (
                    <li
                      key={`pair-${settlement.from}-${settlement.to}-${index}`}
                      className="text-sm text-zinc-700 dark:text-zinc-300"
                    >
                      <strong>{settlement.from}</strong> owes{" "}
                      <strong>{settlement.to}</strong>{" "}
                      {expenses[0]?.currency ?? ""} {settlement.amount.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="grid gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
                    Global Simplified
                  </p>
                  {simplifiedSettlements.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      All settled up.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {simplifiedSettlements.map((settlement, index) => (
                        <li
                          key={`global-${settlement.from}-${settlement.to}-${index}`}
                          className="text-sm text-zinc-700 dark:text-zinc-300"
                        >
                          <strong>{settlement.from}</strong> owes{" "}
                          <strong>{settlement.to}</strong>{" "}
                          {expenses[0]?.currency ?? ""} {settlement.amount.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
                    Pair-wise Netting
                  </p>
                  {pairwiseSettlements.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      All settled up.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {pairwiseSettlements.map((settlement, index) => (
                        <li
                          key={`pair-${settlement.from}-${settlement.to}-${index}`}
                          className="text-sm text-zinc-700 dark:text-zinc-300"
                        >
                          <strong>{settlement.from}</strong> owes{" "}
                          <strong>{settlement.to}</strong>{" "}
                          {expenses[0]?.currency ?? ""} {settlement.amount.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
