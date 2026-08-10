/** Portal chrome icons — v2 filled indigo on soft tiles. */

export function IconLang({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity="0.14" />
      <text
        x="7.5"
        y="12"
        fill="currentColor"
        fontSize="8"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
      >
        A
      </text>
      <text
        x="11.2"
        y="18.2"
        fill="currentColor"
        fontSize="7.2"
        fontWeight="700"
        fontFamily="system-ui, 'PingFang SC', 'Noto Sans SC', sans-serif"
      >
        文
      </text>
    </svg>
  );
}

export function IconSettings({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="currentColor">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.6.24-1.15.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.68.22l2.39-.96c.48.39 1.03.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.8c.24 0 .45-.18.5-.42l.36-2.54c.6-.24 1.15-.55 1.63-.94l2.39.96c.26.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
    </svg>
  );
}

export function IconBell({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="currentColor">
      <path d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Zm6.6-6.2V11a6.55 6.55 0 0 0-5.1-6.35V4a1.5 1.5 0 1 0-3 0v.65A6.55 6.55 0 0 0 5.4 11v4.8L4 17.2v.9h16v-.9l-1.4-1.4Z" />
    </svg>
  );
}

export function IconUser({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="currentColor">
      <path d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Zm0 2.1c-3.15 0-9.45 1.58-9.45 4.73V21h18.9v-2.17C21.45 15.68 15.15 14.1 12 14.1Z" />
    </svg>
  );
}

export function IconSidebar({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="currentColor">
      <path d="M4 4.75A1.75 1.75 0 0 1 5.75 3h12.5A1.75 1.75 0 0 1 20 4.75v14.5A1.75 1.75 0 0 1 18.25 21H5.75A1.75 1.75 0 0 1 4 19.25V4.75Zm1.75-.25a.25.25 0 0 0-.25.25v14.5c0 .14.11.25.25.25H9V4.5H5.75Zm4.75 0v15.5h7.75a.25.25 0 0 0 .25-.25V4.75a.25.25 0 0 0-.25-.25H10.5Z" />
    </svg>
  );
}
