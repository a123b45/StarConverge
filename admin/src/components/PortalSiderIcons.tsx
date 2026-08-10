/** TokenPortal-like thin nav icons for portal sidebar. */

type IconProps = { size?: number };

export function NavIconOverview({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function NavIconKey({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="8" cy="12" r="3.2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 12h9m-3-2.2V12m0 0v2.2" />
    </svg>
  );
}

export function NavIconUsage({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" d="M5 19V10M12 19V5M19 19v-7" />
    </svg>
  );
}

export function NavIconChat({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4 3.2V15H7.5A2.5 2.5 0 0 1 5 12.5v-6Z"
      />
    </svg>
  );
}

export function NavIconDocs({ size = 16 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 5.5A1.5 1.5 0 0 1 7.5 4H14l4 4v10.5A1.5 1.5 0 0 1 16.5 20h-9A1.5 1.5 0 0 1 6 18.5v-13Z"
      />
      <path strokeLinecap="round" d="M14 4v4h4M9 12h6M9 15.5h4" />
    </svg>
  );
}
