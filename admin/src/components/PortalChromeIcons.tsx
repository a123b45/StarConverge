/** Minimal outline icons for portal chrome (Xinference-style toolbar). */

export function IconLang({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <text
        x="8.2"
        y="11.2"
        fill="currentColor"
        stroke="none"
        fontSize="7.5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        A
      </text>
      <text
        x="11.5"
        y="17.5"
        fill="currentColor"
        stroke="none"
        fontSize="7"
        fontWeight="650"
        fontFamily="system-ui, 'PingFang SC', 'Noto Sans SC', sans-serif"
      >
        文
      </text>
    </svg>
  );
}

export function IconSettings({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="2.6" />
      <path
        strokeLinejoin="round"
        d="M19.4 13.1a1.5 1.5 0 0 0 .3 1.6l.06.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.6-.3 1.5 1.5 0 0 0-.9 1.37V18.5a1.8 1.8 0 1 1-3.6 0v-.08a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.6.3l-.06.06a1.8 1.8 0 1 1-2.55-2.55l.06-.06a1.5 1.5 0 0 0 .3-1.6 1.5 1.5 0 0 0-1.37-.9H5.5a1.8 1.8 0 1 1 0-3.6h.08a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.6l-.06-.06a1.8 1.8 0 1 1 2.55-2.55l.06.06a1.5 1.5 0 0 0 1.6.3h.02a1.5 1.5 0 0 0 .9-1.37V5.5a1.8 1.8 0 1 1 3.6 0v.08a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.6-.3l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.6v.02a1.5 1.5 0 0 0 1.37.9H18.5a1.8 1.8 0 1 1 0 3.6h-.08a1.5 1.5 0 0 0-1.37.9z"
      />
    </svg>
  );
}

export function IconBell({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.2 16.2h11.6M7.4 16V11a4.6 4.6 0 0 1 9.2 0v5M10.2 16.2a1.8 1.8 0 0 0 3.6 0"
      />
      <path strokeLinecap="round" d="M12 4.2v1.2" />
    </svg>
  );
}

export function IconUser({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8.8" r="3.1" />
      <path strokeLinecap="round" d="M5.2 18.8c1.5-2.6 3.7-3.9 6.8-3.9s5.3 1.3 6.8 3.9" />
    </svg>
  );
}

export function IconSidebar({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </svg>
  );
}
