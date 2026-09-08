/** Simple line-art sun mark for 辉煌 branding (8 pointed rays). */
export default function BrandLogo({
  className = "",
  size = 28,
  title = "辉煌",
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
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
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {rays.map((deg) => (
            <path
              key={deg}
              transform={`rotate(${deg} 16 16)`}
              d="M16 2.8c1.35 1.7 1.7 3.35 1.05 4.85-1.55-.45-2.9-.45-4.45 0C12.3 6.15 13.1 4.5 16 2.8Z"
            />
          ))}
          <circle cx="16" cy="16" r="5.6" />
        </g>
        <circle cx="16" cy="16" r="2.35" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
