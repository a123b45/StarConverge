/** Password visibility eye icons for auth forms. */

export function IconEyeOpen({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
      />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function IconEyeOff({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" d="M4 4l16 16" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.9 9.95A2.6 2.6 0 0 0 12 14.6c.5 0 1-.14 1.4-.4M7.1 7.25C5 8.55 3.4 10.5 2.5 12c0 0 3.5 6.5 9.5 6.5 1.7 0 3.2-.4 4.5-1.05M11.1 5.55c.3-.03.6-.05.9-.05 6 0 9.5 6.5 9.5 6.5a17.6 17.6 0 0 1-2.2 2.85"
      />
    </svg>
  );
}
