"use client";

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function NetWorthChart({
  data,
}: {
  data: { date: string; netWorth: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-trace)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--color-trace)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
          tickFormatter={(d: string) => d.slice(5)}
        />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--color-ink-faint)", fontSize: 11 }}
          tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
        />
        <Tooltip
          cursor={{ stroke: "var(--color-line)" }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <div className="tile px-3 py-1.5 text-xs font-medium">
                {payload[0].payload.date} · $
                {(payload[0].value as number).toLocaleString("en-CA", {
                  minimumFractionDigits: 2,
                })}
              </div>
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="netWorth"
          stroke="var(--color-trace)"
          strokeWidth={2}
          fill="url(#nwFill)"
          dot={false}
          activeDot={{ r: 3, fill: "var(--color-trace)", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
