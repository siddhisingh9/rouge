// Today's cycle ring: one segment per day, coloured by phase. Days already passed are
// solid, days to come are faint, and a marker shows today. Decorative for screen
// readers: the same information is in the text next to it.
import type { ReactNode } from 'react';
import type { RingModel } from '../lib/cycleRing.ts';
import './CycleRing.css';

const SIZE = 248;
const C = SIZE / 2;
const R = 104;
const STROKE = 16;

function polar(angleDeg: number, r = R): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arc(fromDeg: number, toDeg: number): string {
  const [x1, y1] = polar(fromDeg);
  const [x2, y2] = polar(toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

export function CycleRing({ model, children }: { model: RingModel; children: ReactNode }) {
  const total = model.days.length;
  const step = 360 / total;
  const gap = Math.min(1.6, step * 0.18);
  const todayIndex = Math.min(model.cycleDay, total) - 1;
  // Late: the marker sits at the end of the ring.
  const markerAngle = model.late ? 360 : (todayIndex + 0.5) * step;
  const [mx, my] = polar(markerAngle);
  const todayPhase = model.late ? 'neutral' : model.days[todayIndex]!;

  return (
    <div className="ring">
      <svg
        className="ring__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
        focusable="false"
      >
        <circle cx={C} cy={C} r={R} className="ring__track" strokeWidth={STROKE} />
        {model.days.map((phase, i) => (
          <path
            key={i}
            d={arc(i * step + gap / 2, (i + 1) * step - gap / 2)}
            className={`ring__seg ring__seg--${phase}${i > todayIndex ? ' ring__seg--future' : ''}`}
            strokeWidth={STROKE}
          />
        ))}
        <circle
          cx={mx}
          cy={my}
          r={STROKE / 2 + 5}
          className={`ring__marker ring__marker--${todayPhase}`}
        />
      </svg>
      <div className="ring__center">{children}</div>
    </div>
  );
}
