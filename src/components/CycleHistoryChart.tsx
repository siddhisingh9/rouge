// Spec §7 Insights: cycle history as horizontal bars, most recent first. Counted
// (valid) cycles are solid; skipped / short / paused gaps are hatched AND tagged in
// words, so the difference never relies on colour alone. Every bar carries its value,
// and a visually hidden table gives screen readers the same data.
import { useId } from 'react';
import type { ISODate } from '../engine/types.ts';
import { formatDayMonth } from '../lib/format.ts';
import type { HistoryRow } from '../lib/insights.ts';
import { useElementWidth } from '../lib/useElementWidth.ts';
import './CycleHistoryChart.css';

interface Props {
  rows: readonly HistoryRow[];
  typicalLength: number;
  today: ISODate;
}

const LABEL_W = 84; // date column
const LABEL_GAP = 6; // between a bar's end and its value
const CHAR_W = 7.5; // generous average glyph width at 13px, for fitting labels
const ROW_H = 32;
const BAR_H = 14;
const TOP = 26; // room for the "typical" label
const RADIUS = 4;

/** Estimated width of a row's value label, e.g. "58 · 2 skipped". */
function labelWidth(row: HistoryRow): number {
  return (String(row.length).length + (row.tag ? row.tag.length + 3 : 0)) * CHAR_W;
}

/** A bar growing right from x0: square at the baseline, 4px rounded data-end. */
function barPath(x0: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h / 2);
  const x1 = x0 + w;
  return [
    `M${x0},${y}`,
    `H${x1 - r}`,
    `Q${x1},${y} ${x1},${y + r}`,
    `V${y + h - r}`,
    `Q${x1},${y + h} ${x1 - r},${y + h}`,
    `H${x0}`,
    'Z',
  ].join(' ');
}

export function CycleHistoryChart({ rows, typicalLength, today }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const hatchId = useId();
  const hasUncounted = rows.some((r) => !r.counted);

  // The largest scale at which every bar still has room for its own label after it
  // (and the typical line stays inside the plot).
  const available = width - LABEL_W - LABEL_GAP;
  const scale = Math.max(
    0.5,
    Math.min(
      (available - 40) / typicalLength,
      ...rows.map((r) => (available - labelWidth(r)) / r.length),
    ),
  );
  const height = TOP + rows.length * ROW_H;
  const typicalX = LABEL_W + typicalLength * scale;

  return (
    <div className="history">
      <ul className="history__legend" aria-hidden="true">
        <li>
          <span className="history__swatch history__swatch--counted" />
          Counted in your average
        </li>
        {hasUncounted && (
          <li>
            <span className="history__swatch history__swatch--other" />
            Not counted
          </li>
        )}
      </ul>

      <div ref={ref} className="history__plot">
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true" className="history__svg">
            <defs>
              <pattern
                id={hatchId}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" className="history__hatch-bg" />
                <line x1="0" y1="0" x2="0" y2="6" className="history__hatch-line" />
              </pattern>
            </defs>

            {/* Typical cycle length reference */}
            <line
              x1={typicalX}
              x2={typicalX}
              y1={TOP - 6}
              y2={height}
              className="history__typical"
            />
            <text x={typicalX} y={TOP - 12} textAnchor="middle" className="history__typical-label">
              typical {typicalLength}
            </text>

            {/* Baseline */}
            <line x1={LABEL_W} x2={LABEL_W} y1={TOP - 6} y2={height} className="history__axis" />

            {rows.map((row, i) => {
              const y = TOP + i * ROW_H;
              const barY = y + (ROW_H - BAR_H) / 2;
              const w = Math.max(2, row.length * scale);
              const mid = y + ROW_H / 2;
              return (
                <g key={row.start}>
                  <text
                    x={LABEL_W - 10}
                    y={mid}
                    textAnchor="end"
                    dominantBaseline="central"
                    className="history__date"
                  >
                    {formatDayMonth(row.start, today)}
                  </text>
                  <path
                    d={barPath(LABEL_W, barY, w, BAR_H)}
                    className={row.counted ? 'history__bar' : undefined}
                    fill={row.counted ? undefined : `url(#${hatchId})`}
                  />
                  <text
                    x={LABEL_W + w + LABEL_GAP}
                    y={mid}
                    dominantBaseline="central"
                    className="history__value"
                  >
                    {row.length}
                    {row.tag && <tspan className="history__tag"> · {row.tag}</tspan>}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <table className="visually-hidden">
        <caption>Cycle history, most recent first</caption>
        <thead>
          <tr>
            <th scope="col">Started</th>
            <th scope="col">Length</th>
            <th scope="col">Counted in average</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.start}>
              <td>{formatDayMonth(row.start, today)}</td>
              <td>{row.length} days</td>
              <td>{row.counted ? 'Yes' : `No, ${row.tag}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
