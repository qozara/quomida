import React from 'react';

export interface WeightChartDataPoint {
  date: string;           // YYYY-MM-DD
  rawWeightKg?: number;   // Scale weight (translucent scatter dot)
  trendWeightKg: number;  // Smoothed EWMA weight (solid curve)
  note?: string;
}

export interface TrendChartPoint {
  date: string;           // YYYY-MM-DD
  rawValue?: number;      // Scatter dot value (e.g., scale weight or daily intake kcal)
  isPartial?: boolean;    // True if partial/non-qualifying day (e.g., <800 kcal)
  trendValue: number;     // Primary solid curve value (e.g., EWMA weight or Expenditure TDEE)
  secondaryTrendValue?: number; // Optional dashed curve value (e.g., smoothed intake trend)
  note?: string;
}

export interface WeightTrendChartProps {
  data: WeightChartDataPoint[];
  genericData?: TrendChartPoint[];
  rangeDays: 14 | 30 | 90;
  onRangeChange: (range: 14 | 30 | 90) => void;
  unitLabel?: string;
  valuePrecision?: number;
  accentTheme?: 'emerald' | 'amber';
  height?: number;
  emptyStateMessage?: string;
  rawLegendLabel?: string;
  trendLegendLabel?: string;
  secondaryTrendLegendLabel?: string;
}

export const WeightTrendChart: React.FC<WeightTrendChartProps> = ({
  data,
  genericData,
  rangeDays,
  onRangeChange,
  unitLabel = 'kg',
  valuePrecision = 1,
  accentTheme = 'emerald',
  height = 200,
  emptyStateMessage = 'No weight logs recorded yet.',
  rawLegendLabel = 'Scale Weight',
  trendLegendLabel = 'EWMA Trend',
  secondaryTrendLegendLabel
}) => {
  // Normalize points from either genericData or WeightChartDataPoint[]
  const points: TrendChartPoint[] = React.useMemo(() => {
    if (genericData) return genericData;
    return data.map((d) => ({
      date: d.date,
      rawValue: d.rawWeightKg,
      trendValue: d.trendWeightKg,
      note: d.note
    }));
  }, [data, genericData]);

  const isAmber = accentTheme === 'amber';
  const activeRangeClass = isAmber
    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm';
  const primaryTextClass = isAmber ? 'text-amber-400' : 'text-emerald-400';
  const primaryBgClass = isAmber ? 'bg-amber-400' : 'bg-emerald-400';
  const hoverFillClass = isAmber ? 'hover:fill-amber-400' : 'hover:fill-emerald-400';
  const gradientColor = isAmber ? '#f59e0b' : '#10b981';
  const gradientId = isAmber ? 'energy-trend-gradient' : 'weight-trend-gradient';

  // If no data points, render empty state
  if (points.length === 0) {
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
                  ? activeRangeClass
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-700/50'
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
  const padding = { top: 20, right: 16, bottom: 28, left: valuePrecision === 0 ? 48 : 42 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Extract all values for scaling
  const allValues: number[] = [];
  points.forEach((d) => {
    if (d.trendValue !== undefined) allValues.push(d.trendValue);
    if (d.rawValue !== undefined) allValues.push(d.rawValue);
    if (d.secondaryTrendValue !== undefined) allValues.push(d.secondaryTrendValue);
  });

  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const valueSpan = rawMax - rawMin;
  const defaultMargin = valuePrecision === 0 ? 100 : 1;
  const minMargin = valuePrecision === 0 ? 50 : 0.5;
  const margin = valueSpan === 0 ? defaultMargin : Math.max(minMargin, valueSpan * 0.08);
  const minValue =
    valuePrecision === 0
      ? Math.max(0, Math.floor((rawMin - margin) / 10) * 10)
      : Math.floor((rawMin - margin) * 10) / 10;
  const maxValue =
    valuePrecision === 0
      ? Math.ceil((rawMax + margin) / 10) * 10
      : Math.ceil((rawMax + margin) * 10) / 10;
  const effectiveSpan = Math.max(valuePrecision === 0 ? 10 : 0.1, maxValue - minValue);

  // Helper mappings
  const getX = (index: number) => {
    if (points.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (points.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    const ratio = (val - minValue) / effectiveSpan;
    return padding.top + chartHeight - ratio * chartHeight;
  };

  // Primary trend path and area
  const trendPoints = points.map((d, i) => ({
    x: getX(i),
    y: getY(d.trendValue)
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

  // Secondary trend path (e.g., smoothed intake trend line)
  const secondaryPoints = points
    .map((d, i) =>
      d.secondaryTrendValue !== undefined
        ? { x: getX(i), y: getY(d.secondaryTrendValue) }
        : null
    )
    .filter((pt): pt is { x: number; y: number } => pt !== null);

  const secondaryPathD = secondaryPoints.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  // Grid levels (3 levels: max, mid, min)
  const midValue = (maxValue + minValue) / 2;
  const gridLevels = [
    { value: maxValue, y: getY(maxValue) },
    { value: midValue, y: getY(midValue) },
    { value: minValue, y: getY(minValue) }
  ];

  // X-axis date labels: start, mid, end
  const dateLabels = [
    { label: points[0].date.slice(5), x: getX(0), anchor: 'start' as const },
    ...(points.length > 2
      ? [
          {
            label: points[Math.floor(points.length / 2)].date.slice(5),
            x: getX(Math.floor(points.length / 2)),
            anchor: 'middle' as const
          }
        ]
      : []),
    ...(points.length > 1
      ? [
          {
            label: points[points.length - 1].date.slice(5),
            x: getX(points.length - 1),
            anchor: 'end' as const
          }
        ]
      : [])
  ];

  return (
    <div className="w-full space-y-3">
      {/* Top Header: Legend & Range Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300/80 border border-slate-200" />
            <span>{rawLegendLabel}</span>
          </div>
          <div className={`flex items-center gap-1.5 ${primaryTextClass}`}>
            <span className={`w-4 h-0.5 rounded-full ${primaryBgClass}`} />
            <span>{trendLegendLabel}</span>
          </div>
          {secondaryTrendLegendLabel && (
            <div className="flex items-center gap-1.5 text-sky-400">
              <span className="w-4 h-0.5 border-b-2 border-dashed border-sky-400" />
              <span>{secondaryTrendLegendLabel}</span>
            </div>
          )}
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
                  ? activeRangeClass
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-700/50'
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
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gradientColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={gradientColor} stopOpacity="0.0" />
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
                {lvl.value.toFixed(valuePrecision)} {unitLabel}
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

          {/* Area gradient under primary curve */}
          {areaPathD && <path d={areaPathD} fill={`url(#${gradientId})`} />}

          {/* Secondary dashed trend line (if present) */}
          {secondaryPathD && (
            <path
              d={secondaryPathD}
              fill="none"
              stroke="currentColor"
              className="text-sky-400"
              strokeWidth="1.75"
              strokeDasharray="4 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Primary Trend line */}
          {trendPathD && (
            <path
              d={trendPathD}
              fill="none"
              stroke="currentColor"
              className={primaryTextClass}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Scatter dots */}
          {points.map((d, i) => {
            if (d.rawValue === undefined) return null;
            const cx = getX(i);
            const cy = getY(d.rawValue);
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={d.isPartial ? '3' : '3.5'}
                className={
                  d.isPartial
                    ? 'fill-slate-900 stroke-slate-400/70 opacity-75 transition-colors'
                    : `fill-slate-300/80 stroke-slate-100 ${hoverFillClass} transition-colors`
                }
                strokeDasharray={d.isPartial ? '2 1' : undefined}
                strokeWidth="1.5"
              >
                <title>
                  {`${d.date}: ${d.rawValue} ${unitLabel} (${trendLegendLabel}: ${d.trendValue} ${unitLabel})${d.note ? ` - ${d.note}` : ''}`}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
