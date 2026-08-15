import { useEffect } from "react";

/** Non-interactive success toast (e.g. 复制成功!). */
export default function SoftToast({
  message,
  onDone,
  ms = 2200,
}: {
  message: string | null;
  onDone?: () => void;
  ms?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => onDone?.(), ms);
    return () => window.clearTimeout(t);
  }, [message, ms, onDone]);

  if (!message) return null;
  return (
    <div className="soft-toast" role="status" aria-live="polite">
      <span className="soft-toast-icon" aria-hidden>
        ✓
      </span>
      <span className="soft-toast-text">{message}</span>
    </div>
  );
}
