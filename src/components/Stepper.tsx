// − [ n ] + number input. The field can also be typed into; it clamps on blur.
import { useId, useState } from 'react';
import './Stepper.css';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function Stepper({ label, value, min, max, unit, disabled, onChange }: StepperProps) {
  const id = useId();
  // While typing, keep the raw text so the user can clear the field mid-edit.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(clamp(n));
    setDraft(null);
  };

  return (
    <div className="stepper">
      <label className="stepper__label" htmlFor={id}>
        {label}
      </label>
      <div className="stepper__controls">
        <button
          type="button"
          className="stepper__btn"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - 1))}
        >
          −
        </button>
        <input
          id={id}
          className="stepper__input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          disabled={disabled}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        {unit && (
          <span className="stepper__unit" aria-hidden="true">
            {unit}
          </span>
        )}
        <button
          type="button"
          className="stepper__btn"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}
