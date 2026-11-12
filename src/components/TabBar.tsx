export type Tab = 'today' | 'calendar' | 'insights' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'insights', label: 'Insights' },
  { id: 'settings', label: 'Settings' },
];

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="tab-bar__item"
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
