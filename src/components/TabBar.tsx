import { useLocale } from '../i18n/LocaleContext';

export type AppTab = 'start' | 'desk' | 'history' | 'news';

const TABS: AppTab[] = ['start', 'desk', 'history', 'news'];

export function TabBar({ current, onChange }: { current: AppTab; onChange: (tab: AppTab) => void }) {
  const { messages } = useLocale();

  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          className={`tab-button${current === tab ? ' tab-button-active' : ''}`}
          aria-current={current === tab ? 'page' : undefined}
          onClick={() => onChange(tab)}
        >
          {messages.tabs[tab]}
        </button>
      ))}
    </nav>
  );
}

export function isAppTab(value: string | null | undefined): value is AppTab {
  return value === 'start' || value === 'desk' || value === 'history' || value === 'news';
}
