// Spec §7 Insights: averages and how they're computed, regularity, prediction
// accuracy, symptom patterns and the cycle history chart. All derived on the fly.
import { useMemo, type ReactNode } from 'react';
import { CycleHistoryChart } from '../components/CycleHistoryChart.tsx';
import { DropIcon, TodayIcon } from '../components/icons.tsx';
import { backtest } from '../engine/backtest.ts';
import { PATTERN_MIN_CYCLES } from '../engine/constants.ts';
import { symptomPatterns } from '../engine/patterns.ts';
import { days } from '../lib/format.ts';
import {
  accuracy,
  cycleMethodText,
  historyRows,
  HISTORY_LIMIT,
  patternShare,
  patternsState,
  patternText,
  periodMethodText,
  regularity,
  showDoctorNote,
} from '../lib/insights.ts';
import { useDerived, type DerivedState } from '../lib/useDerived.ts';
import './Insights.css';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="insights__section" aria-label={title}>
      <h2 className="insights__heading">{title}</h2>
      {children}
    </section>
  );
}

export function InsightsScreen() {
  const derived = useDerived();
  if (!derived) return <p className="muted">Loading…</p>;
  return <Insights derived={derived} />;
}

function Insights({ derived }: { derived: DerivedState }) {
  const {
    logs,
    pauses,
    settings,
    today,
    cycles,
    validCycles,
    cycleEstimate,
    periodEstimate,
    irregular,
  } = derived;
  const skipped = derived.skippedInLast365;
  const setupCycle = settings.onboardingCycleLength;
  const setupPeriod = settings.onboardingPeriodLength;

  const accuracyInfo = useMemo(
    () => accuracy(backtest(logs, pauses, { cycleLength: setupCycle, periodLength: setupPeriod })),
    [logs, pauses, setupCycle, setupPeriod],
  );
  const patterns = useMemo(() => symptomPatterns(logs, cycles), [logs, cycles]);
  const anySymptoms = useMemo(() => logs.some((l) => l.symptoms.length > 0), [logs]);

  const reg = regularity(cycleEstimate, irregular, skipped);
  const patternState = patternsState(validCycles.length, anySymptoms, patterns.length);
  const rows = historyRows(cycles);
  const shortCount = cycles.filter((c) => c.status === 'short').length;

  return (
    <div className="insights">
      <h1>Insights</h1>

      <Section title="Averages">
        <div className="insights__tiles">
          <div className="insights__card insights__tile">
            <span className="insights__icon insights__icon--cycle" aria-hidden="true">
              <TodayIcon size={18} />
            </span>
            <p className="insights__label">Cycle length</p>
            <p className="insights__value">{days(cycleEstimate.length)}</p>
            <p className="insights__how">{cycleMethodText(cycleEstimate, setupCycle)}</p>
          </div>
          <div className="insights__card insights__tile">
            <span className="insights__icon insights__icon--period" aria-hidden="true">
              <DropIcon size={18} />
            </span>
            <p className="insights__label">Period length</p>
            <p className="insights__value">{days(periodEstimate.length)}</p>
            <p className="insights__how">{periodMethodText(periodEstimate)}</p>
          </div>
        </div>
      </Section>

      <Section title="Regularity">
        <div className="insights__card">
          <p className="insights__title">
            {reg.title}
            {reg.spread !== null && <span className="insights__badge">±{days(reg.spread)}</span>}
          </p>
          <p className="insights__body">{reg.detail}</p>
          {shortCount > 0 && (
            <p className="insights__body muted">
              {shortCount === 1
                ? 'One unusually short cycle isn’t counted in your averages.'
                : `${shortCount} unusually short cycles aren’t counted in your averages.`}
            </p>
          )}
        </div>
      </Section>

      {showDoctorNote(skipped) && (
        <aside className="insights__card insights__note" aria-label="A note about skipped periods">
          <p className="insights__body">
            You’ve skipped {skipped} periods in the last year. That can happen for lots of everyday
            reasons, like stress, travel, illness or changes in weight or exercise. If it’s new for
            you or keeps happening, it’s worth mentioning to a doctor or nurse next time you see
            one.
          </p>
        </aside>
      )}

      <Section title="Prediction accuracy">
        <div className="insights__card">
          {accuracyInfo.available ? (
            <>
              <p className="insights__title">{accuracyInfo.headline}</p>
              {accuracyInfo.bias && <p className="insights__body">{accuracyInfo.bias}</p>}
              <p className="insights__how">
                Checked by predicting each of your last {accuracyInfo.n} periods using only the data
                you had before it.
              </p>
            </>
          ) : (
            <p className="insights__body muted">
              This appears once {accuracyInfo.needed} of your periods can be compared with what was
              predicted for them ({accuracyInfo.checked} so far).
            </p>
          )}
        </div>
      </Section>

      <Section title="Symptom patterns">
        <div className="insights__card">
          {patternState === 'found' ? (
            <ul className="insights__patterns">
              {patterns.map((p) => (
                <li key={`${p.symptom}-${p.frame}-${p.from}`}>
                  <span className="insights__pattern">{patternText(p)}</span>
                  <span className="insights__how">{patternShare(p, validCycles.length)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="insights__body muted">
              {patternState === 'none'
                ? 'No clear patterns yet. They’ll show up here as you keep logging.'
                : `Log symptoms for ${PATTERN_MIN_CYCLES}+ cycles to see patterns.`}
            </p>
          )}
        </div>
      </Section>

      <Section title="Cycle history">
        <div className="insights__card">
          {rows.length > 0 ? (
            <>
              <p className="insights__how">
                {cycles.length > HISTORY_LIMIT
                  ? `Your last ${HISTORY_LIMIT} cycles, most recent first, in days.`
                  : 'Most recent first, in days.'}
              </p>
              <CycleHistoryChart rows={rows} typicalLength={cycleEstimate.length} today={today} />
            </>
          ) : (
            <p className="insights__body muted">
              Your cycle history appears here once you’ve logged two periods.
            </p>
          )}
        </div>
      </Section>

      <p className="insights__disclaimer muted">
        These are estimates from your logged history, not medical advice.
      </p>
    </div>
  );
}
