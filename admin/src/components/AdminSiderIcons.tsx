/** Thin outline icons for admin sidebar (TokenPortal-style). */

type IconProps = { size?: number };

export function AdminIconDash({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function AdminIconLogs({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" d="M8 7h10M8 12h10M8 17h6" />
      <path strokeLinecap="round" d="M5 7h.01M5 12h.01M5 17h.01" />
    </svg>
  );
}

export function AdminIconChannel({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 8h8v8H8z" />
      <path strokeLinecap="round" d="M4 12h4M16 12h4M12 4v4M12 16v4" />
    </svg>
  );
}

export function AdminIconKey({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="8" cy="12" r="3.2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 12h9m-3-2.2V12m0 0v2.2" />
    </svg>
  );
}

export function AdminIconRoute({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="6.5" cy="6.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 7.5h5.2a3.8 3.8 0 0 1 3.8 3.8V15" />
    </svg>
  );
}

export function AdminIconProxy({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8H4.5A1.5 1.5 0 0 0 3 9.5v5A1.5 1.5 0 0 0 4.5 16H7M17 8h2.5A1.5 1.5 0 0 1 21 9.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
      <path strokeLinecap="round" d="M9 12h6M14.5 9.5 17 12l-2.5 2.5M9.5 9.5 7 12l2.5 2.5" />
    </svg>
  );
}

export function AdminIconUsers({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="9" cy="9" r="2.8" />
      <path strokeLinecap="round" d="M4.2 18c.9-2.2 2.6-3.3 4.8-3.3s3.9 1.1 4.8 3.3" />
      <circle cx="16.2" cy="9.2" r="2.2" />
      <path strokeLinecap="round" d="M15.2 14.8c1.5-.2 2.9.4 3.8 1.8" />
    </svg>
  );
}

export function AdminIconSettings({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="2.6" />
      <path
        strokeLinejoin="round"
        d="M19.4 13.1a1.5 1.5 0 0 0 .3 1.6l.06.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-1.6-.3 1.5 1.5 0 0 0-.9 1.37V18.5a1.8 1.8 0 1 1-3.6 0v-.08a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.6.3l-.06.06a1.8 1.8 0 1 1-2.55-2.55l.06-.06a1.5 1.5 0 0 0 .3-1.6 1.5 1.5 0 0 0-1.37-.9H5.5a1.8 1.8 0 1 1 0-3.6h.08a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.6l-.06-.06a1.8 1.8 0 1 1 2.55-2.55l.06.06a1.5 1.5 0 0 0 1.6.3h.02a1.5 1.5 0 0 0 .9-1.37V5.5a1.8 1.8 0 1 1 3.6 0v.08a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.6-.3l.06-.06a1.8 1.8 0 1 1 2.55 2.55l-.06.06a1.5 1.5 0 0 0-.3 1.6v.02a1.5 1.5 0 0 0 1.37.9H18.5a1.8 1.8 0 1 1 0 3.6h-.08a1.5 1.5 0 0 0-1.37.9z"
      />
    </svg>
  );
}
