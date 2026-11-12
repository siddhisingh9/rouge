// An on/off switch: a native checkbox with role="switch", so it is announced as one.
import { useId, type ReactNode } from 'react';
import './Switch.css';

interface SwitchProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, description, checked, onChange }: SwitchProps) {
  const id = useId();
  const descId = useId();
  return (
    <div className="switch">
      <div className="switch__text">
        <label htmlFor={id} className="switch__label">
          {label}
        </label>
        {description && (
          <p id={descId} className="switch__description muted">
            {description}
          </p>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch__input"
        checked={checked}
        aria-describedby={description ? descId : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}
