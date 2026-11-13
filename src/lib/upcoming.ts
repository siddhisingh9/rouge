// The "Coming up" cards on Today. Pure, so the wording can be tested.
import { PMS_DAYS } from '../engine/constants.ts';
import { addDays, diffDays } from '../engine/dates.ts';
import type { PredictedCycle } from '../engine/forecast.ts';
import type { Status } from '../engine/status.ts';
import type { ISODate } from '../engine/types.ts';
import { days, formatShortDate } from './format.ts';

export type UpcomingKind = 'period' | 'ovulation' | 'fertile' | 'pms' | 'cycle';

export interface UpcomingCard {
  kind: UpcomingKind;
  title: string;
  value: string;
  sub: string;
}

function inDays(n: number): string {
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${days(n)}`;
}

interface Input {
  status: Status;
  next: PredictedCycle | undefined;
  today: ISODate;
  showFertileWindow: boolean;
  cycleLength: number;
  periodLength: number;
}

export function upcomingCards(input: Input): UpcomingCard[] {
  const { status, next, today, showFertileWindow, cycleLength, periodLength } = input;
  const { phase } = status;
  if (phase === 'paused' || phase === 'no_data' || !next) return [];

  const cards: UpcomingCard[] = [];
  const nextDate = formatShortDate(next.periodStart);

  if (phase === 'late') {
    cards.push({
      kind: 'period',
      title: 'Period',
      value: `Late by ${days(status.daysLate ?? 0)}`,
      sub: `Expected ${nextDate}`,
    });
  } else {
    cards.push({
      kind: 'period',
      title: phase === 'possibly_skipped' ? 'Next likely period' : 'Next period',
      value: inDays(diffDays(next.periodStart, today)),
      sub: nextDate,
    });
  }

  if (phase !== 'late' && phase !== 'possibly_skipped') {
    const toOvulation = diffDays(next.ovulation, today);
    if (toOvulation >= -1) {
      cards.push({
        kind: 'ovulation',
        title: 'Ovulation (est.)',
        value: Math.abs(toOvulation) <= 1 ? 'Around now' : inDays(toOvulation),
        sub: formatShortDate(next.ovulation),
      });
    } else {
      const pmsStart = addDays(next.periodStart, -PMS_DAYS);
      const toPms = diffDays(pmsStart, today);
      cards.push({
        kind: 'pms',
        title: 'PMS days',
        value: toPms > 0 ? inDays(toPms) : 'Now',
        sub: toPms > 0 ? formatShortDate(pmsStart) : `Until ${nextDate}`,
      });
    }

    if (showFertileWindow) {
      const toStart = diffDays(next.fertileStart, today);
      const toEnd = diffDays(next.fertileEnd, today);
      if (toStart > 0) {
        cards.push({
          kind: 'fertile',
          title: 'Fertile window (est.)',
          value: inDays(toStart),
          sub: formatShortDate(next.fertileStart),
        });
      } else if (toEnd >= 0) {
        cards.push({
          kind: 'fertile',
          title: 'Fertile window (est.)',
          value: 'Now',
          sub: `Until ${formatShortDate(next.fertileEnd)}`,
        });
      }
    }
  }

  cards.push({
    kind: 'cycle',
    title: 'Your cycle',
    value: `~${days(cycleLength)}`,
    sub: `Period ~${days(periodLength)}`,
  });
  return cards;
}
