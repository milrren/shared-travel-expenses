"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatCurrencyBRL } from "@/lib/currency";

export interface ChartEntry {
  name: string;
  total: number;
}

interface Props {
  byParticipant: ChartEntry[];
  byCategory: ChartEntry[];
}

const BAR_COLORS = [
  "#3f3f46", // zinc-700
  "#52525b", // zinc-600
  "#71717a", // zinc-500
  "#a1a1aa", // zinc-400
  "#d4d4d8", // zinc-300
];

function barColor(index: number): string {
  return BAR_COLORS[index % BAR_COLORS.length];
}

interface TooltipPayloadItem {
  value: number;
  name: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-800">
      <p className="font-medium text-zinc-800 dark:text-zinc-100">{label}</p>
      <p className="text-zinc-500 dark:text-zinc-400">
        {formatCurrencyBRL(payload[0].value)}
      </p>
    </div>
  );
}

function HorizontalBarChart({ data }: { data: ChartEntry[] }) {
  const barHeight = 28;
  const chartHeight = Math.max(data.length * barHeight + 20, 80);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={90}
          tick={{ fontSize: 11, fill: "currentColor" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
        <Bar dataKey="total" radius={[0, 3, 3, 0]} maxBarSize={16}>
          {data.map((_, index) => (
            <Cell key={index} fill={barColor(index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ExpenseCharts({ byParticipant, byCategory }: Props) {
  const totalSpending = byParticipant.reduce((sum, entry) => sum + entry.total, 0);

  return (
    <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Spending overview
        </h3>
        <div className="text-right">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Total</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {formatCurrencyBRL(totalSpending)}
          </p>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            By participant
          </p>
          <div className="text-zinc-700 dark:text-zinc-300">
            <HorizontalBarChart data={byParticipant} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            By category
          </p>
          <div className="text-zinc-700 dark:text-zinc-300">
            <HorizontalBarChart data={byCategory} />
          </div>
        </div>
      </div>
    </div>
  );
}
