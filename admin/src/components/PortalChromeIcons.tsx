/** Minimal outline icons for portal chrome (Xinference-style toolbar). */
export function IconLang({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 5h8M8 5v2a7 7 0 0 0 7 7" strokeLinecap="round" />
      <path d="M5 19h7l3.5-8H19" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 19l2-4.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconSettings({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="3" />
      <path
        strokeLinecap="round"
        d="M12 3.5v1.6M12 18.9v1.6M4.9 6.5l1.2 1.1M17.9 16.4l1.2 1.1M3.5 12h1.6M18.9 12h1.6M4.9 17.5l1.2-1.1M17.9 7.6l1.2-1.1"
      />
    </svg>
  );
}

export function IconBell({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.5 16.5h11M7.2 16.2V11a4.8 4.8 0 0 1 9.6 0v5.2M10 16.5a2 2 0 0 0 4 0"
      />
    </svg>
  );
}

export function IconUser({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="9" r="3.2" />
      <path strokeLinecap="round" d="M5.5 18.5c1.4-2.4 3.5-3.6 6.5-3.6s5.1 1.2 6.5 3.6" />
    </svg>
  );
}

export function IconSidebar({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </svg>
  );
}
