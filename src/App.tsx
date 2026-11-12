import { useState } from 'react';
import { TabBar, type Tab } from './components/TabBar.tsx';
import { TodayScreen } from './screens/TodayScreen.tsx';
import { CalendarScreen } from './screens/CalendarScreen.tsx';
import { InsightsScreen } from './screens/InsightsScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';

// State-based navigation — no router (spec §2: avoids GitHub Pages 404s).
export default function App() {
  const [tab, setTab] = useState<Tab>('today');

  return (
    <div className="app">
      <main className="screen">
        {tab === 'today' && <TodayScreen />}
        {tab === 'calendar' && <CalendarScreen />}
        {tab === 'insights' && <InsightsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
