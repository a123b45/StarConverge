/** Simple line-art sun mark for 辉煌 branding. */
export default function BrandLogo({
  className = "",
  size = 28,
  title = "辉煌",
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <span
      className={`brand-sun ${className}`.trim()}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title}
    >
      <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden>
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {rays.map((deg) => (
            <path
              key={deg}
              transform={`rotate(${deg} 16 16)`}
              d="M16 3.4c1.15 1.35 1.55 2.85 1.15 4.15-1.35-.35-2.5-.35-3.7 0 .25-1.4.95-2.9 2.55-4.15Z"
            />
          ))}
          <circle cx="16" cy="16" r="5.35" />
        </g>
        <circle cx="16" cy="16" r="2.55" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
