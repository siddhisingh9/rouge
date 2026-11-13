// Spec §7 Today: cycle status (as a ring), what's coming up, the daily message,
// Log period / Period ended, and a quick log for today.
import { useState, type ComponentType } from 'react';
import { BackupBanner } from '../components/BackupBanner.tsx';
import { CycleRing } from '../components/CycleRing.tsx';
import { DayEditor } from '../components/DayEditor.tsx';
import {
  CheckIcon,
  DropIcon,
  LeafIcon,
  MoonIcon,
  PauseIcon,
  PlusIcon,
  SparkleIcon,
} from '../components/icons.tsx';
import {
  FLOW_LABELS,
  MOOD_EMOJI,
  MOOD_LABELS,
  PHASE_LABELS,
  SYMPTOM_LABELS,
} from '../content/labels.ts';
import type { Phase, Status } from '../engine/status.ts';
import type { DailyLog, Pause } from '../engine/types.ts';
import { ringModel } from '../lib/cycleRing.ts';
import { days, formatLongDate, formatShortDate } from '../lib/format.ts';
import { endPeriod, logPeriodStart } from '../lib/periodActions.ts';
import { save } from '../lib/save.ts';
import { upcomingCards, type UpcomingKind } from '../lib/upcoming.ts';
import { useDailyMessage } from '../lib/useDailyMessage.ts';
import { useDerived, type DerivedState } from '../lib/useDerived.ts';
import './Today.css';

/** Keep a short date like "Wed 9 Dec" on one line. */
const noWrap = (s: string) => s.replace(/ /g, ' ');

/** Colour family for each phase (CSS: .tone--period etc.). */
function tone(phase: Phase): string {
  switch (phase) {
    case 'period':
    case 'follicular':
    case 'ovulation':
    case 'luteal':
    case 'pms':
      return phase;
    default:
      return 'neutral';
  }
}

/** The line under the phase name. */
function nextLine(
  status: Status,
  nextStart: string | undefined,
  activePause: Pause | undefined,
): string {
  const { phase, daysUntilNext, daysLate } = status;
  switch (phase) {
    case 'no_data':
      return 'No periods logged yet. You can add past ones from the Calendar.';
    case 'paused':
      if (!activePause) return '';
      return activePause.end
        ? `Until ${noWrap(formatShortDate(activePause.end))}`
        : `Since ${noWrap(formatShortDate(activePause.start))}`;
    case 'late':
      return `Your period is ${days(daysLate ?? 0)} late`;
    case 'possibly_skipped':
      return daysUntilNext !== null && nextStart
        ? `Next likely period in ${days(daysUntilNext)} · ${noWrap(formatShortDate(nextStart))}`
        : 'Predictions have moved to your next likely period.';
    default:
      if (daysUntilNext === null || !nextStart) return '';
      if (daysUntilNext === 0) return 'Period expected today';
      return `Next period in ${days(daysUntilNext)} · ${noWrap(formatShortDate(nextStart))}`;
  }
}

const CARD_ICONS: Record<UpcomingKind, ComponentType<{ size?: number }>> = {
  period: DropIcon,
  ovulation: SparkleIcon,
  fertile: LeafIcon,
  pms: MoonIcon,
  cycle: CheckIcon,
};

const STATE_ICONS: Partial<Record<Phase, ComponentType<{ size?: number }>>> = {
  no_data: DropIcon,
  paused: PauseIcon,
  possibly_skipped: MoonIcon,
};

interface Tag {
  key: string;
  text: string;
  emoji?: string;
  flow?: boolean;
}

function logTags(log: DailyLog | undefined): Tag[] {
  if (!log) return [];
  return [
    ...(log.flow ? [{ key: 'flow', text: `${FLOW_LABELS[log.flow]} flow`, flow: true }] : []),
    ...log.symptoms.map((s) => ({ key: s, text: SYMPTOM_LABELS[s] })),
    ...log.moods.map((m) => ({ key: m, text: MOOD_LABELS[m], emoji: MOOD_EMOJI[m] })),
    ...(log.notes.trim() ? [{ key: 'note', text: 'Note' }] : []),
  ];
}

export function TodayScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const derived = useDerived();
  if (!derived) return <p className="muted">Loading…</p>;
  return <Today derived={derived} onOpenSettings={onOpenSettings} />;
}

function Today({ derived, onOpenSettings }: { derived: DerivedState; onOpenSettings: () => void }) {
  const [editing, setEditing] = useState(false);
  const { today, logs, pauses, status, periodEstimate, cycleEstimate, predictions, settings } =
    derived;
  const { phase, cycleDay } = status;
  const next = predictions[0];
  const activePause = pauses.find((p) => p.start <= today && (p.end === null || p.end >= today));

  const message = useDailyMessage({
    phase,
    funMode: settings.funMode,
    vars: { cycleDay, daysUntilNext: status.daysUntilNext },
    today,
    lastMessage: settings.lastMessage,
    recentMessageIds: settings.recentMessageIds,
  });

  const ring = ringModel(status, next, periodEstimate.length, today);
  const cards = upcomingCards({
    status,
    next,
    today,
    showFertileWindow: settings.showFertileWindow,
    cycleLength: cycleEstimate.length,
    periodLength: periodEstimate.length,
  });
  const todayLog = logs.find((l) => l.date === today);
  // Based on today's log rather than the phase, so it also works during a pause.
  const inPeriod = !!todayLog?.flow;
  const tags = logTags(todayLog);
  const StateIcon = STATE_ICONS[phase];

  const heading = (
    <>
      <p className="hero__phase">
        <span className="hero__dot" aria-hidden="true" />
        {PHASE_LABELS[phase]}
      </p>
      <p className="hero__next">{nextLine(status, next?.periodStart, activePause)}</p>
    </>
  );

  return (
    <section className={`today tone--${tone(phase)}`}>
      <header className="today__top">
        <p className="today__date">{formatLongDate(today, today)}</p>
        <h1 className="today__title">Today</h1>
      </header>

      <BackupBanner
        lastBackupAt={settings.lastBackupAt}
        firstLogDate={logs[0]?.date}
        today={today}
        onOpenSettings={onOpenSettings}
      />

      <div className={`hero status-card status-card--${phase}`}>
        {ring ? (
          <>
            <CycleRing model={ring}>
              <span className="ring__label">Day</span>
              <span className="ring__day">{cycleDay}</span>
              <span className="ring__of">
                {ring.late ? `usually ~${cycleEstimate.length}` : `of ~${cycleEstimate.length}`}
              </span>
            </CycleRing>
            {heading}
          </>
        ) : (
          <>
            {StateIcon && (
              <span className="hero__icon" aria-hidden="true">
                <StateIcon size={36} />
              </span>
            )}
            {phase === 'possibly_skipped' && cycleDay !== null && (
              <p className="hero__day">Day {cycleDay}</p>
            )}
            {heading}
          </>
        )}
      </div>

      {inPeriod ? (
        <button
          type="button"
          className="btn btn--primary btn--block btn--with-icon"
          onClick={() => save(endPeriod(logs, today))}
        >
          <CheckIcon size={20} />
          Period ended
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--block btn--with-icon"
          onClick={() => save(logPeriodStart(logs, today, periodEstimate.length))}
        >
          <DropIcon size={20} />
          Log period
        </button>
      )}

      <figure className="message-card">
        <span className="message-card__icon" aria-hidden="true">
          <SparkleIcon size={18} />
        </span>
        <blockquote className="today__message" aria-live="polite">
          {message ?? ' '}
        </blockquote>
      </figure>

      {cards.length > 0 && (
        <section className="upcoming" aria-label="Coming up">
          <h2 className="today__section-title">Coming up</h2>
          {/* Focusable so keyboard users can scroll it sideways. */}
          <ul className="upcoming__list" tabIndex={0} aria-label="Coming up, scrolls sideways">
            {cards.map((c) => {
              const Icon = CARD_ICONS[c.kind];
              return (
                <li key={c.kind} className={`upcoming__card upcoming__card--${c.kind}`}>
                  <span className="upcoming__icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="upcoming__title">{c.title}</span>
                  <span className="upcoming__value">{c.value}</span>
                  <span className="upcoming__sub">{c.sub}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="today-log card" aria-label="Today’s log">
        <div className="today-log__head">
          <h2 className="today__section-title">Today’s log</h2>
          <button
            type="button"
            className="btn btn--secondary btn--small btn--with-icon"
            onClick={() => setEditing(true)}
          >
            {tags.length > 0 ? (
              'Edit'
            ) : (
              <>
                <PlusIcon size={16} />
                Add
              </>
            )}
            <span className="visually-hidden"> symptoms, mood or notes for today</span>
          </button>
        </div>
        {tags.length > 0 ? (
          <ul className="today-log__tags">
            {tags.map((t) => (
              <li key={t.key} className={t.flow ? 'tag tag--flow' : 'tag'}>
                {t.emoji && <span aria-hidden="true">{t.emoji} </span>}
                {t.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted today-log__empty">
            How are you feeling? Add symptoms, mood or a note.
          </p>
        )}
      </section>

      {derived.irregular && phase !== 'paused' && (
        <p className="today__note muted">
          Your cycles vary quite a bit, so predictions are less certain. They’ll improve as you log
          more.
        </p>
      )}

      <DayEditor
        date={editing ? today : null}
        today={today}
        logs={logs}
        periodLength={periodEstimate.length}
        onClose={() => setEditing(false)}
      />
    </section>
  );
}
