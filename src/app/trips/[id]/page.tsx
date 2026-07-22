import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { formatCurrencyBRL } from "@/lib/currency";
import { Trip, Expense, ExpenseSplitShare } from "@/types";
import ExpenseCharts, { ChartEntry } from "@/components/expense-charts";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    mode?: string;
    participant?: string | string[];
    category?: string | string[];
  }>;
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
      (share) => `${share.participant} ${formatCurrencyBRL(share.cents / 100)}`
    )
    .join(", ");
}

function normalizeCategory(category?: string): string {
  const trimmed = category?.trim();
  if (!trimmed) {
    return "Sem categoria";
  }

  return trimmed;
}

function toParamArray(value?: string | string[]): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}

function toggleFilterValue(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }

  return [...values, value];
}

function buildTripHref(
  tripId: string,
  mode: string,
  participants: string[],
  categories: string[]
): string {
  const query = new URLSearchParams();
  query.set("mode", mode);

  participants.forEach((participant) => {
    query.append("participant", participant);
  });

  categories.forEach((category) => {
    query.append("category", category);
  });

  return `/trips/${tripId}?${query.toString()}`;
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
  const { mode, participant, category } = await searchParams;
  const balanceMode =
    mode === "pairwise" || mode === "compare" ? mode : "global";
  const [trip, expenses] = await Promise.all([getTrip(id), getExpenses(id)]);

  if (!trip) notFound();

  const simplifiedSettlements = computeSettlements(expenses, trip.participants);
  const pairwiseSettlements = computePairwiseSettlements(
    expenses,
    trip.participants
  );
  const participantFilters = toParamArray(participant)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .filter((name) => trip.participants.includes(name));
  const participantFilterSet = new Set(participantFilters);

  const categoryOptionsMap = new Map<string, number>();
  for (const expense of expenses) {
    const normalizedCategory = normalizeCategory(expense.category);
    categoryOptionsMap.set(
      normalizedCategory,
      (categoryOptionsMap.get(normalizedCategory) ?? 0) + expense.amount
    );
  }

  const categoryOptions = Array.from(categoryOptionsMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
  const validCategoryNames = new Set(categoryOptions.map((item) => item.name));

  const categoryFilters = toParamArray(category)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .filter((name) => validCategoryNames.has(name));
  const categoryFilterSet = new Set(categoryFilters);

  const hasActiveFilters =
    participantFilters.length > 0 || categoryFilters.length > 0;

  const filteredExpenses = expenses.filter((expense) => {
    const participantMatch =
      participantFilterSet.size === 0 || participantFilterSet.has(expense.paidBy);
    const categoryMatch =
      categoryFilterSet.size === 0 ||
      categoryFilterSet.has(normalizeCategory(expense.category));

    return participantMatch && categoryMatch;
  });

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const byParticipantMap = new Map<string, number>();
  const byCategoryMap = new Map<string, number>();
  for (const expense of filteredExpenses) {
    byParticipantMap.set(
      expense.paidBy,
      (byParticipantMap.get(expense.paidBy) ?? 0) + expense.amount
    );
    const cat = normalizeCategory(expense.category);
    byCategoryMap.set(cat, (byCategoryMap.get(cat) ?? 0) + expense.amount);
  }
  const byParticipant: ChartEntry[] = Array.from(byParticipantMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
  const byCategory: ChartEntry[] = Array.from(byCategoryMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

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
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Link
                  href={buildTripHref(id, balanceMode, [], [])}
                  className="rounded-full border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  Clear filters
                </Link>
              )}
              <Link
                href={`/trips/${id}/expenses/new`}
                className="rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 px-4 py-1.5 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
              >
                + Add Expense
              </Link>
            </div>
          </div>

          {filteredExpenses.length > 0 && (
            <ExpenseCharts
              byParticipant={byParticipant}
              byCategory={byCategory}
            />
          )}

          {expenses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 p-10 text-center text-zinc-500 dark:text-zinc-400">
              No expenses yet.
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 p-10 text-center text-zinc-500 dark:text-zinc-400">
              No expenses match the active filters.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {filteredExpenses.map((expense) => (
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
                        {formatCurrencyBRL(expense.amount)}
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

          {filteredExpenses.length > 0 && (
            <p className="mt-4 text-right text-sm text-zinc-500 dark:text-zinc-400">
              Total: <strong>{formatCurrencyBRL(totalAmount)}</strong>
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
            <ul className="flex flex-wrap gap-2">
              {trip.participants.map((p) => (
                <li
                  key={p}
                >
                  <Link
                    href={buildTripHref(
                      id,
                      balanceMode,
                      toggleFilterValue(participantFilters, p),
                      categoryFilters
                    )}
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      participantFilterSet.has(p)
                        ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
                    }`}
                  >
                    {p}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
              Categories
            </h3>

            {categoryOptions.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No categories yet.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {categoryOptions.map((entry) => (
                  <li key={entry.name}>
                    <Link
                      href={buildTripHref(
                        id,
                        balanceMode,
                        participantFilters,
                        toggleFilterValue(categoryFilters, entry.name)
                      )}
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        categoryFilterSet.has(entry.name)
                          ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
                      }`}
                    >
                      {entry.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {hasActiveFilters && (
              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                <Link
                  href={buildTripHref(id, balanceMode, [], [])}
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  Clear all filters
                </Link>
              </div>
            )}
          </div>

          {/* Balances */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5">
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 mb-3">
              Balances
            </h3>
            <div className="mb-4 flex flex-wrap gap-2">
              <Link
                href={buildTripHref(
                  id,
                  "global",
                  participantFilters,
                  categoryFilters
                )}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  balanceMode === "global"
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                }`}
              >
                Global Simplified
              </Link>
              <Link
                href={buildTripHref(
                  id,
                  "pairwise",
                  participantFilters,
                  categoryFilters
                )}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  balanceMode === "pairwise"
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                }`}
              >
                Pair-wise Netting
              </Link>
              <Link
                href={buildTripHref(
                  id,
                  "compare",
                  participantFilters,
                  categoryFilters
                )}
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
                      {formatCurrencyBRL(settlement.amount)}
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
                      {formatCurrencyBRL(settlement.amount)}
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
                          {formatCurrencyBRL(settlement.amount)}
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
                          {formatCurrencyBRL(settlement.amount)}
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
