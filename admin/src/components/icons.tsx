/** Shared SVG chrome — one stroke language for the whole admin UI. */
import type { ReactNode, SVGProps } from "react";

type SizeProps = { size?: number; className?: string };

const defaults = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({
  size = 16,
  children,
  className,
  ...rest
}: SizeProps & { children: ReactNode } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={className}
      {...defaults}
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ─── Navigation (admin + portal) ─── */

export function IconGrid({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </Svg>
  );
}

export function IconList({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconLayers({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M12 3.5 20 8l-8 4.5L4 8l8-4.5Z" />
      <path d="m4 12 8 4.5L20 12" />
      <path d="m4 16 8 4.5L20 16" />
    </Svg>
  );
}

export function IconKey({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <circle cx="7.5" cy="12" r="3.25" />
      <path d="M10.5 12h9.2M16.2 12v2.4M19 12v2.4" />
    </Svg>
  );
}

export function IconShare({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <circle cx="18" cy="5.5" r="2.25" />
      <circle cx="6" cy="12" r="2.25" />
      <circle cx="18" cy="18.5" r="2.25" />
      <path d="m8.1 10.9 7.8-4.3M8.1 13.1l7.8 4.3" />
    </Svg>
  );
}

export function IconArrows({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M8 8 4 12l4 4M16 8l4 4-4 4M10 12h4" />
    </Svg>
  );
}

/** Isometric wireframe cube — used for 模型管理 */
export function IconBox({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.29 7 8.71 5 8.71-5" />
      <path d="M12 22V12" />
    </Svg>
  );
}

export function IconUsers({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.8-2.8 2.8-4.2 5.5-4.2s4.7 1.4 5.5 4.2" />
      <circle cx="16.5" cy="9" r="2.4" />
      <path d="M14.8 14.6c1.8-.35 3.4.35 4.7 2" />
    </Svg>
  );
}

export function IconGear({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.55 1.55M17.55 15.95l1.55 1.55M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.55-1.55M17.55 8.05l1.55-1.55" />
    </Svg>
  );
}

export function IconShield({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M12 3.5 19 6.5v5.2c0 4.2-2.9 7.4-7 8.8-4.1-1.4-7-4.6-7-8.8V6.5L12 3.5Z" />
      <path d="m9.2 12 1.9 1.9 3.7-3.8" />
    </Svg>
  );
}

export function IconChart({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M4.5 19.5h15" />
      <path d="M7 16.5V11M12 16.5V7M17 16.5v-3.5" />
    </Svg>
  );
}

export function IconChat({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M5.5 17.2V7.8A2.3 2.3 0 0 1 7.8 5.5h8.4a2.3 2.3 0 0 1 2.3 2.3v6.2a2.3 2.3 0 0 1-2.3 2.3H9.2L5.5 19.5v-2.3Z" />
    </Svg>
  );
}

export function IconFile({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V6A1.5 1.5 0 0 1 7 4.5Z" />
      <path d="M14 4.5V9h4.5M9 13h6M9 16.5h4" />
    </Svg>
  );
}

export function IconCard({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
      <path d="M3.5 10.5h17" />
      <path d="M7 15h3.5" />
    </Svg>
  );
}

export function IconBill({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v13l-2.2-1.4-2.3 1.4-2.3-1.4-2.3 1.4-2.2-1.4V6A1.5 1.5 0 0 1 7 4.5Z" />
      <path d="M9 9h6M9 12.5h6M9 16h4" />
    </Svg>
  );
}

/* ─── Top chrome ─── */

export function IconSidebar({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
      <path d="M9 4.5v15" />
    </Svg>
  );
}

export function IconLang({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.2" />
      <text
        x="7.2"
        y="11.6"
        fill="currentColor"
        stroke="none"
        fontSize="7.5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        A
      </text>
      <text
        x="11.2"
        y="17.8"
        fill="currentColor"
        stroke="none"
        fontSize="7"
        fontWeight="650"
        fontFamily="system-ui, 'PingFang SC', 'Noto Sans SC', sans-serif"
      >
        文
      </text>
    </Svg>
  );
}

export function IconSun({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v1.8M12 19.4v1.8M2.8 12h1.8M19.4 12h1.8M5.4 5.4l1.3 1.3M17.3 17.3l1.3 1.3M5.4 18.6l1.3-1.3M17.3 6.7l1.3-1.3" />
    </Svg>
  );
}

export function IconMoon({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M20.2 14.2A8.2 8.2 0 0 1 9.8 3.8 8.4 8.4 0 1 0 20.2 14.2Z" />
    </Svg>
  );
}

export function IconBell({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M12 4.2a5.3 5.3 0 0 1 5.3 5.3v3.4l1.4 2.6H5.3l1.4-2.6V9.5A5.3 5.3 0 0 1 12 4.2Z" />
      <path d="M9.6 18.2a2.4 2.4 0 0 0 4.8 0" />
    </Svg>
  );
}

export function IconUser({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5.2 19c1.4-2.7 3.6-4 6.8-4s5.4 1.3 6.8 4" />
    </Svg>
  );
}

export function IconSettings({ size = 18 }: SizeProps) {
  return <IconGear size={size} />;
}

export function IconEye({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M2.8 12s3.4-6.2 9.2-6.2S21.2 12 21.2 12s-3.4 6.2-9.2 6.2S2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  );
}

export function IconEyeOff({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="m4 4 16 16" />
      <path d="M9.9 9.9A2.6 2.6 0 0 0 12 14.6c.45 0 .88-.1 1.26-.3" />
      <path d="M7.2 7.35C5.25 8.55 3.7 10.35 2.8 12c0 0 3.4 6.2 9.2 6.2 1.55 0 2.95-.35 4.15-.9" />
      <path d="M11.15 5.85c.28-.04.56-.05.85-.05 5.8 0 9.2 6.2 9.2 6.2a16.5 16.5 0 0 1-2.05 2.7" />
    </Svg>
  );
}

export function IconCopy({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M6.2 15.5H5.5A2 2 0 0 1 3.5 13.5v-8A2 2 0 0 1 5.5 3.5h8a2 2 0 0 1 2 2v.7" />
    </Svg>
  );
}

export function IconPencil({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M13.5 4.5 19 10l-9.8 9.8H3.7v-5.5L13.5 4.5Z" />
      <path d="m11.8 6.2 5.5 5.5" />
    </Svg>
  );
}

export function IconTrash({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M6.5 7l.8 11.2A1.5 1.5 0 0 0 8.8 19.5h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
      <path d="M10 10.5v6M14 10.5v6" />
    </Svg>
  );
}

export function IconPerson({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="8.5" r="3.2" />
      <path d="M5 19.2c1.2-3 3.4-4.5 7-4.5s5.8 1.5 7 4.5" />
    </Svg>
  );
}

export function IconLock({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Svg>
  );
}

export function IconMail({ size = 18 }: SizeProps) {
  return (
    <Svg size={size}>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="m4.5 8 7.5 5.5L19.5 8" />
    </Svg>
  );
}

export function IconMore({ size = 16 }: SizeProps) {
  return (
    <Svg size={size}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* Aliases kept for existing imports */
export const IconEyeOpen = IconEye;
export const AdminIconDash = IconGrid;
export const AdminIconLogs = IconList;
export const AdminIconChannel = IconLayers;
export const AdminIconKey = IconKey;
export const AdminIconRoute = IconShare;
export const AdminIconProxy = IconBox;
export const AdminIconUsers = IconUsers;
export const AdminIconSettings = IconGear;
export const NavIconOverview = IconGrid;
export const NavIconKey = IconKey;
export const NavIconUsage = IconChart;
export const NavIconChat = IconChat;
export const NavIconDocs = IconFile;
export const NavIconRecharge = IconCard;
export const NavIconBills = IconBill;
