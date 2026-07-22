"use client";

import { useState } from "react";
import type { ExpenseSplitShare } from "@/types";

const CURRENCY_OPTIONS = ["BRL", "EUR", "USD", "GBP", "CHF", "JPY", "AUD", "CAD"];

type SplitMode = "equal" | "custom";

export interface ExpenseFormPayload {
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  splitAmong: string[] | ExpenseSplitShare[];
  date: string;
  category: string;
}

interface ExpenseFormInitialValues {
  description?: string;
  amount?: number;
  currency?: string;
  paidBy?: string;
  splitAmong?: string[] | ExpenseSplitShare[];
  date?: string;
  category?: string;
}

interface ExpenseFormProps {
  participants: string[];
  initialValues?: ExpenseFormInitialValues;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: ExpenseFormPayload) => Promise<string | null | void>;
}

export function ExpenseForm({
  participants,
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
}: ExpenseFormProps) {
  const initialSplitAmong = initialValues?.splitAmong;
  const initialUsesCustomSplit =
    Array.isArray(initialSplitAmong) &&
    initialSplitAmong.length > 0 &&
    initialSplitAmong.every(
      (value) => typeof value === "object" && value !== null && "participant" in value
    );

  const initialSplitParticipants = initialUsesCustomSplit
    ? (initialSplitAmong as ExpenseSplitShare[]).map((share) => share.participant)
    : ((initialSplitAmong as string[] | undefined) ?? participants);

  const initialCustomSplitAmounts = (initialUsesCustomSplit
    ? (initialSplitAmong as ExpenseSplitShare[]).reduce<Record<string, string>>((acc, share) => {
        acc[share.participant] = String(share.amount);
        return acc;
      }, {})
    : {}) as Record<string, string>;

  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [amount, setAmount] = useState(
    initialValues?.amount !== undefined ? String(initialValues.amount) : ""
  );
  const [currency, setCurrency] = useState(initialValues?.currency ?? "BRL");
  const [paidBy, setPaidBy] = useState(initialValues?.paidBy ?? participants[0] ?? "");
  const [splitMode, setSplitMode] = useState<SplitMode>(
    initialUsesCustomSplit ? "custom" : "equal"
  );
  const [splitAmong, setSplitAmong] = useState<string[]>(initialSplitParticipants);
  const [customSplitAmounts, setCustomSplitAmounts] = useState<Record<string, string>>(
    initialCustomSplitAmounts
  );
  const [date, setDate] = useState(
    initialValues?.date ?? new Date().toISOString().slice(0, 10)
  );
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toCents(value: number): number {
    return Math.round(value * 100);
  }

  function formatCustomTotalLabel(): string {
    if (splitMode !== "custom") {
      return "";
    }

    const assignedCents = splitAmong.reduce((sum, participant) => {
      const parsed = Number.parseFloat(customSplitAmounts[participant] ?? "");
      return sum + (Number.isFinite(parsed) ? toCents(parsed) : 0);
    }, 0);

    const totalAmount = Number.parseFloat(amount);
    const totalCents = Number.isFinite(totalAmount) ? toCents(totalAmount) : 0;
    const remainingCents = totalCents - assignedCents;

    return `Assigned ${currency} ${(assignedCents / 100).toFixed(2)} of ${currency} ${(totalCents / 100).toFixed(2)} (${remainingCents === 0 ? "balanced" : `${remainingCents > 0 ? "remaining" : "excess"} ${currency} ${(Math.abs(remainingCents) / 100).toFixed(2)}`})`;
  }

  function handleSplitModeChange(mode: SplitMode) {
    setSplitMode(mode);

    if (mode === "custom") {
      setCustomSplitAmounts((prev) => {
        const next = { ...prev };
        for (const participant of splitAmong) {
          if (!(participant in next)) {
            next[participant] = "";
          }
        }
        return next;
      });
    }
  }

  function toggleParticipant(name: string) {
    setSplitAmong((prev) => {
      if (prev.includes(name)) {
        setCustomSplitAmounts((current) => {
          const next = { ...current };
          delete next[name];
          return next;
        });
        return prev.filter((p) => p !== name);
      }

      setCustomSplitAmounts((current) => ({ ...current, [name]: current[name] ?? "" }));
      return [...prev, name];
    });
  }

  function updateCustomAmount(participant: string, value: string) {
    setCustomSplitAmounts((prev) => ({ ...prev, [participant]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsedAmount = parseFloat(amount);
    if (
      !description ||
      Number.isNaN(parsedAmount) ||
      parsedAmount <= 0 ||
      !paidBy ||
      !date ||
      splitAmong.length === 0
    ) {
      setError("All required fields must be filled in correctly.");
      return;
    }

    let splitPayload: string[] | ExpenseSplitShare[] = splitAmong;

    if (splitMode === "custom") {
      const splitShares: ExpenseSplitShare[] = [];
      for (const participant of splitAmong) {
        const parsedShare = Number.parseFloat(customSplitAmounts[participant] ?? "");
        if (!Number.isFinite(parsedShare) || parsedShare <= 0) {
          setError("Each selected participant must have a split amount greater than zero.");
          return;
        }
        splitShares.push({ participant, amount: parsedShare });
      }

      const sumCents = splitShares.reduce((sum, share) => sum + toCents(share.amount), 0);
      const totalCents = toCents(parsedAmount);
      if (sumCents !== totalCents) {
        setError("The sum of split amounts must match the total expense amount.");
        return;
      }

      splitPayload = splitShares;
    }

    setLoading(true);
    try {
      const submissionError = await onSubmit({
        description,
        amount: parsedAmount,
        currency,
        paidBy,
        splitAmong: splitPayload,
        date,
        category,
      });

      if (submissionError) {
        setError(submissionError);
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Description *
        </span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Hotel booking"
          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Amount *
          </span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="120.00"
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Currency *
          </span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            {CURRENCY_OPTIONS.map((currencyOption) => (
              <option key={currencyOption} value={currencyOption}>
                {currencyOption}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Date *
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          required
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Paid By *
        </span>
        <select
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          disabled={participants.length === 0}
        >
          {participants.map((participant) => (
            <option key={participant} value={participant}>
              {participant}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Split Mode *
        </legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="splitMode"
              checked={splitMode === "equal"}
              onChange={() => handleSplitModeChange("equal")}
              className="rounded border-zinc-300"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Equal split</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="splitMode"
              checked={splitMode === "custom"}
              onChange={() => handleSplitModeChange("custom")}
              className="rounded border-zinc-300"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Custom amounts</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Split Among *
        </legend>
        <div className="flex flex-wrap gap-2">
          {participants.map((participant) => (
            <label
              key={participant}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={splitAmong.includes(participant)}
                onChange={() => toggleParticipant(participant)}
                className="rounded border-zinc-300"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {participant}
              </span>
            </label>
          ))}
        </div>

        {splitMode === "custom" && splitAmong.length > 0 && (
          <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
              {formatCustomTotalLabel()}
            </p>
            <div className="flex flex-col gap-2">
              {splitAmong.map((participant) => (
                <label key={participant} className="flex items-center gap-3">
                  <span className="w-28 text-sm text-zinc-700 dark:text-zinc-300">
                    {participant}
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={customSplitAmounts[participant] ?? ""}
                    onChange={(e) => updateCustomAmount(participant, e.target.value)}
                    placeholder="0.00"
                    className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Category
        </span>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Transport, Food, Accommodation…"
          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 px-6 py-2.5 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {loading ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
