import { useState } from 'react';
import { TabBar, type Tab } from './components/TabBar.tsx';
import { useSettings } from './db/hooks.ts';
import { CalendarScreen } from './screens/CalendarScreen.tsx';
import { InsightsScreen } from './screens/InsightsScreen.tsx';
import { OnboardingScreen } from './screens/OnboardingScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { TodayScreen } from './screens/TodayScreen.tsx';

// State-based navigation — no router (spec §2: avoids GitHub Pages 404s).
export default function App() {
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>('today');

  // Render nothing while the first read loads, so onboarding never flashes up.
  if (!settings) return null;
  if (!settings.onboardingDone) return <OnboardingScreen />;

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
