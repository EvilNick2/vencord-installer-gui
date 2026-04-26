import { House, FolderSync, Archive, ClipboardClock, Settings, FlaskConical } from 'lucide-react';
import AppIcon from '../assets/app_icon.svg';
import '../css/TopNav.css';

type Page = 'home' | 'install' | 'backups' | 'logs' | 'settings' | 'devTests';

type TopNavProps = {
  activePage: Page;
  onNavigate: (page: Page) => void;
  showDevTests: boolean;
  onUpdateClick: () => void;
};

const navItems: { page: Page; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { page: 'home',     label: 'Home',    Icon: House },
  { page: 'install',  label: 'Install', Icon: FolderSync },
  { page: 'backups',  label: 'Backups', Icon: Archive },
  { page: 'logs',     label: 'Logs',    Icon: ClipboardClock },
  { page: 'settings', label: 'Settings',Icon: Settings },
];

export default function TopNav({ activePage, onNavigate, showDevTests, onUpdateClick }: TopNavProps) {
  return (
    <nav className="app-nav top-nav">
      <div className="top-nav__brand">
        <img src={AppIcon} alt="" className="top-nav__logo" aria-hidden="true" />
        <span className="top-nav__name">Vencord Installer</span>
      </div>

      <div className="top-nav__links">
        {navItems.map(({ page, label, Icon }) => (
          <button
            key={page}
            type="button"
            className={`top-nav__item${activePage === page ? ' top-nav__item--active' : ''}`}
            aria-current={activePage === page ? 'page' : undefined}
            onClick={() => onNavigate(page)}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
        {showDevTests && (
          <button
            type="button"
            className={`top-nav__item top-nav__item--dev${activePage === 'devTests' ? ' top-nav__item--active' : ''}`}
            aria-current={activePage === 'devTests' ? 'page' : undefined}
            onClick={() => onNavigate('devTests')}
          >
            <FlaskConical size={13} />
            Dev
          </button>
        )}
      </div>

      <div className="top-nav__actions">
        <button type="button" className="top-nav__update-btn" onClick={onUpdateClick}>
          Updates
        </button>
      </div>
    </nav>
  );
}
