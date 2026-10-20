import React from 'react';

export interface WeightChartDataPoint {
  date: string;           // YYYY-MM-DD
  rawWeightKg?: number;   // Scale weight (translucent scatter dot)
  trendWeightKg: number;  // Smoothed EWMA weight (solid curve)
  note?: string;
}

export interface WeightTrendChartProps {
  data: WeightChartDataPoint[];
  rangeDays: 14 | 30 | 90;
  onRangeChange: (range: 14 | 30 | 90) => void;
  unitLabel?: string;
  height?: number;
  emptyStateMessage?: string;
  rawLegendLabel?: string;
  trendLegendLabel?: string;
}

export const WeightTrendChart: React.FC<WeightTrendChartProps> = ({
  data,
  rangeDays,
  onRangeChange,
  unitLabel = 'kg',
  height = 200,
  emptyStateMessage = 'No weight logs recorded yet.',
  rawLegendLabel = 'Scale Weight',
  trendLegendLabel = 'EWMA Trend'
}) => {
  // If no data points, render empty state
  if (data.length === 0) {
    return (
      <div className="w-full space-y-4">
        {/* Range Controls */}
        <div className="flex items-center justify-end gap-1.5">
          {([14, 30, 90] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r)}
              className={`min-w-[44px] min-h-[44px] px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                rangeDays === r
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white border border-slate-700/50'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>

        <div className="w-full flex items-center justify-center p-8 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl text-center text-sm text-slate-400">
          {emptyStateMessage}
        </div>
      </div>
    );
  }

  // Calculate SVG bounds & scaling
  const svgWidth = 400;
  const svgHeight = height;
  const padding = { top: 20, right: 16, bottom: 28, left: 42 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Extract all weight values for scaling
  const allWeights: number[] = [];
  data.forEach((d) => {
    if (d.trendWeightKg !== undefined) allWeights.push(d.trendWeightKg);
    if (d.rawWeightKg !== undefined) allWeights.push(d.rawWeightKg);
  });

  const rawMin = Math.min(...allWeights);
  const rawMax = Math.max(...allWeights);
  const weightSpan = rawMax - rawMin;
  const margin = weightSpan === 0 ? 1 : Math.max(0.5, weightSpan * 0.08);
  const minWeight = Math.floor((rawMin - margin) * 10) / 10;
  const maxWeight = Math.ceil((rawMax + margin) * 10) / 10;
  const effectiveSpan = Math.max(0.1, maxWeight - minWeight);

  // Helper mappings
  const getX = (index: number) => {
    if (data.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (data.length - 1)) * chartWidth;
  };

  const getY = (weight: number) => {
    const ratio = (weight - minWeight) / effectiveSpan;
    return padding.top + chartHeight - ratio * chartHeight;
  };

  // Trend path and area
  const trendPoints = data.map((d, i) => ({
    x: getX(i),
    y: getY(d.trendWeightKg)
  }));

  const trendPathD = trendPoints.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  const bottomY = padding.top + chartHeight;
  const areaPathD =
    trendPoints.length > 0
      ? `${trendPathD} L ${trendPoints[trendPoints.length - 1].x} ${bottomY} L ${trendPoints[0].x} ${bottomY} Z`
      : '';

  // Grid levels (3 levels: max, mid, min)
  const midWeight = (maxWeight + minWeight) / 2;
  const gridLevels = [
    { weight: maxWeight, y: getY(maxWeight) },
    { weight: midWeight, y: getY(midWeight) },
    { weight: minWeight, y: getY(minWeight) }
  ];

  // X-axis date labels: start, mid, end
  const dateLabels = [
    { label: data[0].date.slice(5), x: getX(0), anchor: 'start' as const },
    ...(data.length > 2
      ? [
          {
            label: data[Math.floor(data.length / 2)].date.slice(5),
            x: getX(Math.floor(data.length / 2)),
            anchor: 'middle' as const
          }
        ]
      : []),
    ...(data.length > 1
      ? [{ label: data[data.length - 1].date.slice(5), x: getX(data.length - 1), anchor: 'end' as const }]
      : [])
  ];

  return (
    <div className="w-full space-y-3">
      {/* Top Header: Legend & Range Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300/80 border border-slate-200" />
            <span>{rawLegendLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-4 h-0.5 rounded-full bg-emerald-400" />
            <span>{trendLegendLabel}</span>
          </div>
        </div>

        {/* Range Controls */}
        <div className="flex items-center gap-1.5">
          {([14, 30, 90] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r)}
              className={`min-w-[44px] min-h-[44px] px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                rangeDays === r
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white border border-slate-700/50'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800 p-2">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="weight-trend-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines & Y-axis labels */}
          {gridLevels.map((lvl, idx) => (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={lvl.y}
                x2={svgWidth - padding.right}
                y2={lvl.y}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth="1"
                opacity="0.5"
              />
              <text
                x={padding.left - 6}
                y={lvl.y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[10px] font-mono"
              >
                {lvl.weight.toFixed(1)} {unitLabel}
              </text>
            </g>
          ))}

          {/* Date labels on X-axis */}
          {dateLabels.map((lbl, idx) => (
            <text
              key={idx}
              x={lbl.x}
              y={svgHeight - 8}
              textAnchor={lbl.anchor}
              className="fill-slate-400 text-[10px] font-mono"
            >
              {lbl.label}
            </text>
          ))}

          {/* Area gradient under EWMA curve */}
          {areaPathD && (
            <path d={areaPathD} fill="url(#weight-trend-gradient)" />
          )}

          {/* Primary EWMA Trend line */}
          {trendPathD && (
            <path
              d={trendPathD}
              fill="none"
              stroke="currentColor"
              className="text-emerald-400"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Raw weight scatter dots */}
          {data.map((d, i) => {
            if (d.rawWeightKg === undefined) return null;
            const cx = getX(i);
            const cy = getY(d.rawWeightKg);
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="3.5"
                className="fill-slate-300/80 stroke-slate-100 hover:fill-emerald-400 transition-colors"
                strokeWidth="1.5"
              >
                <title>
                  {`${d.date}: ${d.rawWeightKg} ${unitLabel} (${trendLegendLabel}: ${d.trendWeightKg} ${unitLabel})${d.note ? ` - ${d.note}` : ''}`}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
