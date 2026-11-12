// Spec §10: short "Add to Home Screen" guide for iPhone, and the separate-storage warning.
import { isStandalone } from '../lib/platform.ts';
import './InstallGuide.css';

/** The iOS Share icon (square with an arrow), drawn inline so it needs no asset. */
function ShareIcon() {
  return (
    <svg
      className="install__icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

export function InstallGuide({ compact = false }: { compact?: boolean }) {
  if (isStandalone()) {
    return (
      <p className="install__note">
        You’re using the Home Screen app. Always open Rouge from its icon: Safari keeps its own,
        separate data.
      </p>
    );
  }

  return (
    <div className="install">
      {compact && <p className="install__title">Add Rouge to your Home Screen first</p>}
      <ol className="install__steps">
        <li>Open this page in Safari.</li>
        <li>
          Tap <strong>Share</strong> <ShareIcon />
          <span className="visually-hidden">(the square with an arrow)</span> in the toolbar.
        </li>
        <li>
          Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
        </li>
        <li>Open Rouge from the new icon on your Home Screen.</li>
      </ol>
      <p className="install__note">
        The Home Screen app keeps its own data, separate from Safari. Anything you log in Safari
        won’t appear there, so always open Rouge from the icon.
      </p>
    </div>
  );
}
