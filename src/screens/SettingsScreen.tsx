// Spec §7 Settings. Backup, export/import and the Add to Home Screen guide arrive in
// Milestones 7–8.
import type { ReactNode } from 'react';
import { PausesSection } from '../components/PausesSection.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { Switch } from '../components/Switch.tsx';
import { updateSettings } from '../db/queries.ts';
import { DEFAULT_CYCLE } from '../engine/constants.ts';
import type { CycleEstimate } from '../engine/estimate.ts';
import { CYCLE_RANGE, PERIOD_RANGE } from '../lib/onboarding.ts';
import { useDerived, type DerivedState } from '../lib/useDerived.ts';
import { useLocalValue } from '../lib/useLocalValue.ts';
import './Settings.css';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings__section" aria-label={title}>
      <h2 className="settings__heading">{title}</h2>
      <div className="settings__card">{children}</div>
    </section>
  );
}

function cycleSourceNote({ method, n }: CycleEstimate): string {
  if (method === 'onboarding') return 'Predictions use this value until you’ve logged a cycle.';
  if (method === 'blend') {
    return `Predictions blend this with your ${n} logged cycle${n === 1 ? '' : 's'}.`;
  }
  return `You’ve logged enough cycles, so predictions now use the median of your last ${n} instead.`;
}

export function SettingsScreen() {
  const derived = useDerived();
  if (!derived) return <p className="muted">Loading…</p>;
  return <Settings derived={derived} />;
}

function Settings({ derived }: { derived: DerivedState }) {
  const { settings, pauses, today, cycleEstimate } = derived;
  const [cycleLength, setCycleLength] = useLocalValue(settings.onboardingCycleLength, (v) =>
    updateSettings({ onboardingCycleLength: v }),
  );
  const [periodLength, setPeriodLength] = useLocalValue(settings.onboardingPeriodLength, (v) =>
    updateSettings({ onboardingPeriodLength: v }),
  );
  const [funMode, setFunMode] = useLocalValue(settings.funMode, (v) =>
    updateSettings({ funMode: v }),
  );
  const [showFertile, setShowFertile] = useLocalValue(settings.showFertileWindow, (v) =>
    updateSettings({ showFertileWindow: v }),
  );
  const notSure = cycleLength === null;

  return (
    <div className="settings">
      <h1>Settings</h1>

      <Section title="Your cycle">
        <p className="muted settings__hint">
          Your setup answers. They’re only used until there’s enough logged history.
        </p>
        <Stepper
          label="Typical cycle length"
          unit="days"
          value={cycleLength ?? DEFAULT_CYCLE}
          min={CYCLE_RANGE.min}
          max={CYCLE_RANGE.max}
          disabled={notSure}
          onChange={setCycleLength}
        />
        <label className="settings__check">
          <input
            type="checkbox"
            checked={notSure}
            onChange={(e) => setCycleLength(e.target.checked ? null : DEFAULT_CYCLE)}
          />
          <span>Not sure (use 28 days)</span>
        </label>
        <p className="muted settings__hint">{cycleSourceNote(cycleEstimate)}</p>
        <Stepper
          label="Typical period length"
          unit="days"
          value={periodLength}
          min={PERIOD_RANGE.min}
          max={PERIOD_RANGE.max}
          onChange={setPeriodLength}
        />
      </Section>

      <Section title="Display">
        <Switch
          label="Fun mode"
          description="Light-hearted daily messages. Off: plain, neutral ones."
          checked={funMode}
          onChange={setFunMode}
        />
        <Switch
          label="Show fertile window"
          description="Shows an estimated fertile window on the calendar. An estimate only — not reliable for contraception."
          checked={showFertile}
          onChange={setShowFertile}
        />
      </Section>

      <Section title="Pauses">
        <PausesSection pauses={pauses} today={today} />
      </Section>

      <Section title="Backup & data">
        <p className="muted settings__hint">
          Optional backup and export/import are coming in a later update. For now, everything is
          stored only on this phone.
        </p>
      </Section>

      <Section title="About">
        <div className="settings__prose">
          <p>
            Rouge is a private period tracker. Predictions come only from what you log on this
            phone.
          </p>
          <h3>Please note</h3>
          <ul>
            <li>Predictions are estimates based on your logged history, not medical advice.</li>
            <li>
              Ovulation and fertile-window estimates are <strong>not</strong> reliable for
              contraception.
            </li>
            <li>
              In this version, backups (once available) are stored unencrypted in the app owner’s
              Supabase project.
            </li>
          </ul>
          <h3>What we store</h3>
          <p>
            On this phone, in the app’s own storage: the days you log (flow, symptoms, moods and
            notes), your pauses, and these settings. Predictions are never stored; they’re worked
            out from your logs each time. Nothing is sent anywhere unless you turn on backup. There
            are no ads, analytics or trackers.
          </p>
        </div>
      </Section>
    </div>
  );
}
