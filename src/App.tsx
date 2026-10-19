import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookActionsProvider } from './actions';
import { haptic, ToastProvider } from './ui';
import { useStore } from './store';
import Home from './components/Home';
import Shelf from './components/Shelf';
import AddBook from './components/AddBook';
import Stats from './components/Stats';
import SettingsView from './components/SettingsView';
import CoinRain from './components/CoinRain';
import Icon, { type IconName } from './components/Icon';

type Tab = 'home' | 'shelf' | 'add' | 'stats' | 'settings';

const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'home', label: 'ホーム' },
  { id: 'shelf', icon: 'library', label: '本棚' },
  { id: 'add', icon: 'camera', label: '登録' },
  { id: 'stats', icon: 'chart', label: '統計' },
  { id: 'settings', icon: 'settings', label: '設定' },
];

export default function App() {
  const { loaded, celebration } = useStore();
  const [tab, setTabState] = useState<Tab>('home');
  // タブごとのスクロール位置を覚えておき、戻ってきたら復元する
  const scrollPos = useRef<Partial<Record<Tab, number>>>({});

  const setTab = (next: Tab) => {
    if (next === tab) {
      // 今のタブをもう一度押したら一番上へ
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    haptic(5);
    scrollPos.current[tab] = window.scrollY;
    setTabState(next);
  };

  useLayoutEffect(() => {
    window.scrollTo(0, scrollPos.current[tab] ?? 0);
  }, [tab]);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  if (!loaded) {
    return (
      <div className="loading">
        <Icon name="piggy" size={26} /> 読み込み中…
      </div>
    );
  }

  return (
    <ToastProvider>
    <BookActionsProvider>
    <div className="app">
      <main className="screen" key={tab}>
        {tab === 'home' && <Home onGoAdd={() => setTab('add')} />}
        {tab === 'shelf' && <Shelf />}
        {tab === 'add' && <AddBook />}
        {tab === 'stats' && <Stats />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={'tab' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">
              <Icon name={t.icon} />
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
      {celebration && <CoinRain key={celebration.key} amount={celebration.amount} />}
    </div>
    </BookActionsProvider>
    </ToastProvider>
  );
}
