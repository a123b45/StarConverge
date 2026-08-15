import { useEffect } from "react";

/** Non-interactive toast. */
export default function SoftToast({
  message,
  tone = "ok",
  onDone,
  ms = 2200,
}: {
  message: string | null;
  tone?: "ok" | "err";
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
    <div
      className={`soft-toast soft-toast-${tone}`}
      role="status"
      aria-live="polite"
    >
      <span className="soft-toast-icon" aria-hidden>
        {tone === "ok" ? "✓" : "!"}
      </span>
      <span className="soft-toast-text">{message}</span>
    </div>
  );
}
