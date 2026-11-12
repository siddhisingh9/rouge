// Spec §7 Onboarding. Answers stay in memory until the final step, then everything is
// saved in one transaction — quitting halfway leaves nothing behind.
// (Spec step 6, "sign in for backup", is added with Supabase in Milestone 8.)
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Stepper } from '../components/Stepper.tsx';
import { Switch } from '../components/Switch.tsx';
import { useLogs } from '../db/hooks.ts';
import { completeOnboarding } from '../db/queries.ts';
import { formatLongDate } from '../lib/format.ts';
import {
  buildOnboarding,
  CYCLE_RANGE,
  defaultAnswers,
  PERIOD_RANGE,
  validateAnswers,
  type OnboardingAnswers,
} from '../lib/onboarding.ts';
import { useToday } from '../lib/today.ts';
import './Onboarding.css';

const STEPS = ['welcome', 'cycle', 'period', 'last', 'earlier', 'fun'] as const;
type Step = (typeof STEPS)[number];

export function OnboardingScreen() {
  const today = useToday();
  const logs = useLogs();
  const [answers, setAnswers] = useState<OnboardingAnswers>(defaultAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastDateId = useId();

  const step: Step = STEPS[stepIndex]!;
  const errors = validateAnswers(answers, today);
  const set = (patch: Partial<OnboardingAnswers>) => setAnswers((a) => ({ ...a, ...patch }));

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    if (stepIndex > 0) headingRef.current?.focus();
  }, [stepIndex]);

  const stepError =
    step === 'last'
      ? errors.lastPeriodStart
      : step === 'earlier' && errors.earlierPeriods.some(Boolean)
        ? 'fix'
        : undefined;

  const next = async () => {
    if (stepError) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    if (step !== 'fun') {
      setStepIndex((i) => i + 1);
      return;
    }
    setSaving(true);
    try {
      const { settings, logPatches } = buildOnboarding(answers, logs ?? [], today);
      await completeOnboarding(settings, logPatches); // App switches to Today on its own
    } catch (e) {
      console.error(e);
      window.alert('Sorry, something went wrong saving your answers. Please try again.');
      setSaving(false);
    }
  };

  const back = () => {
    setShowErrors(false);
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const heading = (text: string) => (
    <h1 ref={headingRef} tabIndex={-1} className="onb__title">
      {text}
    </h1>
  );

  let body: ReactNode;
  switch (step) {
    case 'welcome':
      body = (
        <>
          <h1 className="onb__title onb__title--hero">Welcome to Rouge</h1>
          <p className="onb__lead">A private period tracker for you and your friends.</p>
          <ul className="onb__list">
            <li>
              <strong>Your data stays on this phone.</strong> Nothing leaves it unless you turn on
              backup.
            </li>
            <li>
              <strong>Backup is optional.</strong> In this version backups are stored unencrypted in
              the app owner’s Supabase project, so the app owner could read them.
            </li>
            <li>
              <strong>No ads, analytics or tracking.</strong>
            </li>
          </ul>
          <div className="onb__note">
            <p>Predictions are estimates based on your logged history, not medical advice.</p>
            <p>
              Ovulation and fertile-window estimates are <strong>not</strong> reliable for
              contraception.
            </p>
          </div>
        </>
      );
      break;

    case 'cycle':
      body = (
        <>
          {heading('How long is your cycle, usually?')}
          <p className="muted">
            From the first day of one period to the first day of the next. Many are between 21 and
            35 days.
          </p>
          <Stepper
            label="Cycle length"
            unit="days"
            value={answers.cycleLength}
            min={CYCLE_RANGE.min}
            max={CYCLE_RANGE.max}
            disabled={answers.cycleNotSure}
            onChange={(cycleLength) => set({ cycleLength })}
          />
          <label className="onb__check">
            <input
              type="checkbox"
              checked={answers.cycleNotSure}
              onChange={(e) => set({ cycleNotSure: e.target.checked })}
            />
            <span>Not sure — start with 28 days</span>
          </label>
          <p className="onb__hint muted">
            This is only used until you’ve logged a few cycles. You can change it later in Settings.
          </p>
        </>
      );
      break;

    case 'period':
      body = (
        <>
          {heading('How many days does your period usually last?')}
          <Stepper
            label="Period length"
            unit="days"
            value={answers.periodLength}
            min={PERIOD_RANGE.min}
            max={PERIOD_RANGE.max}
            onChange={(periodLength) => set({ periodLength })}
          />
          <p className="onb__hint muted">Again, just a starting point.</p>
        </>
      );
      break;

    case 'last':
      body = (
        <>
          {heading('When did your last period start?')}
          <div className="onb__field">
            <label htmlFor={lastDateId} className="onb__label">
              First day of your last period
            </label>
            <input
              id={lastDateId}
              className="onb__date"
              type="date"
              max={today}
              value={answers.lastPeriodStart}
              aria-invalid={showErrors && !!errors.lastPeriodStart}
              aria-describedby={
                showErrors && errors.lastPeriodStart ? `${lastDateId}-err` : undefined
              }
              onChange={(e) => set({ lastPeriodStart: e.target.value })}
            />
            {showErrors && errors.lastPeriodStart && (
              <p id={`${lastDateId}-err`} className="onb__error" role="alert">
                {errors.lastPeriodStart}
              </p>
            )}
          </div>
          <p className="onb__hint muted">
            We’ll mark {answers.periodLength} days from then as your period. You can adjust any day
            later on the calendar.
          </p>
        </>
      );
      break;

    case 'earlier':
      body = (
        <EarlierPeriodsStep
          heading={heading('Add earlier periods')}
          answers={answers}
          errors={showErrors ? errors.earlierPeriods : []}
          today={today}
          onChange={(earlierPeriods) => set({ earlierPeriods })}
        />
      );
      break;

    case 'fun':
      body = (
        <>
          {heading('One last thing')}
          <Switch
            label="Fun mode"
            description="A light-hearted message each day about where you are in your cycle. Turn it off for plain, neutral messages."
            checked={answers.funMode}
            onChange={(funMode) => set({ funMode })}
          />
          <div className="onb__example" aria-live="polite">
            <span className="muted">For example:</span>
            <p>
              {answers.funMode
                ? 'Energy’s back. Main character arc unlocked.'
                : 'Day 9 of your cycle.'}
            </p>
          </div>
        </>
      );
      break;
  }

  const isLast = step === 'fun';
  return (
    <div className="onb">
      {stepIndex > 0 && (
        <div className="onb__progress" aria-label={`Step ${stepIndex} of ${STEPS.length - 1}`}>
          {STEPS.slice(1).map((s, i) => (
            <span
              key={s}
              className={`onb__dot${i < stepIndex ? ' onb__dot--done' : ''}`}
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      <main className="onb__body">{body}</main>

      <div className="onb__actions">
        {stepIndex > 0 && (
          <button type="button" className="btn btn--secondary" onClick={back} disabled={saving}>
            Back
          </button>
        )}
        <button
          type="button"
          className="btn btn--primary onb__next"
          onClick={() => void next()}
          disabled={saving}
        >
          {stepIndex === 0
            ? 'Get started'
            : isLast
              ? saving
                ? 'Saving…'
                : 'Start tracking'
              : step === 'earlier' && !answers.earlierPeriods.some((p) => p.start)
                ? 'Skip'
                : 'Next'}
        </button>
      </div>
    </div>
  );
}

function EarlierPeriodsStep({
  heading,
  answers,
  errors,
  today,
  onChange,
}: {
  heading: ReactNode;
  answers: OnboardingAnswers;
  errors: (string | undefined)[];
  today: string;
  onChange: (periods: OnboardingAnswers['earlierPeriods']) => void;
}) {
  const baseId = useId();
  const rows = answers.earlierPeriods;
  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const before = answers.lastPeriodStart || today;

  return (
    <>
      {heading}
      <p className="muted">
        Optional, but it helps a lot: with a few past periods, predictions are accurate from day
        one.
      </p>
      {answers.lastPeriodStart && (
        <p className="onb__hint muted">
          Your last period: {formatLongDate(answers.lastPeriodStart, today)}
        </p>
      )}

      <ul className="onb__rows">
        {rows.map((row, i) => {
          const dateId = `${baseId}-${i}`;
          const error = errors[i];
          return (
            <li key={i} className="onb__row">
              <div className="onb__row-fields">
                <div className="onb__field">
                  <label htmlFor={dateId} className="onb__label">
                    Start date
                  </label>
                  <input
                    id={dateId}
                    className="onb__date"
                    type="date"
                    max={before}
                    value={row.start}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${dateId}-err` : undefined}
                    onChange={(e) => update(i, { start: e.target.value })}
                  />
                </div>
                <Stepper
                  label="Days"
                  value={row.length}
                  min={PERIOD_RANGE.min}
                  max={PERIOD_RANGE.max}
                  onChange={(length) => update(i, { length })}
                />
              </div>
              {error && (
                <p id={`${dateId}-err`} className="onb__error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="btn btn--ghost onb__remove"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={() => onChange([...rows, { start: '', length: answers.periodLength }])}
      >
        + Add a period
      </button>
    </>
  );
}
