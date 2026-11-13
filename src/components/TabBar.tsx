import type { ComponentType } from 'react';
import { CalendarIcon, InsightsIcon, SettingsIcon, TodayIcon } from './icons.tsx';

export type Tab = 'today' | 'calendar' | 'insights' | 'settings';

const TABS: { id: Tab; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'today', label: 'Today', Icon: TodayIcon },
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'insights', label: 'Insights', Icon: InsightsIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="tab-bar__item"
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <span className="tab-bar__icon">
            <Icon size={22} />
          </span>
          <span className="tab-bar__label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
