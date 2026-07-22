"use client";

import { useState } from "react";

const CURRENCY_OPTIONS = ["BRL", "EUR", "USD", "GBP", "CHF", "JPY", "AUD", "CAD"];

export interface ExpenseFormPayload {
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  splitAmong: string[];
  date: string;
  category: string;
}

interface ExpenseFormInitialValues {
  description?: string;
  amount?: number;
  currency?: string;
  paidBy?: string;
  splitAmong?: string[];
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
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [amount, setAmount] = useState(
    initialValues?.amount !== undefined ? String(initialValues.amount) : ""
  );
  const [currency, setCurrency] = useState(initialValues?.currency ?? "BRL");
  const [paidBy, setPaidBy] = useState(initialValues?.paidBy ?? participants[0] ?? "");
  const [splitAmong, setSplitAmong] = useState<string[]>(
    initialValues?.splitAmong ?? participants
  );
  const [date, setDate] = useState(
    initialValues?.date ?? new Date().toISOString().slice(0, 10)
  );
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleParticipant(name: string) {
    setSplitAmong((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
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

    setLoading(true);
    try {
      const submissionError = await onSubmit({
        description,
        amount: parsedAmount,
        currency,
        paidBy,
        splitAmong,
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
