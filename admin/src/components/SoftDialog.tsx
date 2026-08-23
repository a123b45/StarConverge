import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ModalBackdrop from "./ModalBackdrop";

export type SoftConfirmOpts = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

export type SoftAlertOpts = {
  title?: string;
  message: string;
  confirmText?: string;
};

export type SoftPromptOpts = {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  minLength?: number;
  inputType?: "text" | "password";
};

type DialogState =
  | { kind: "confirm"; opts: SoftConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "alert"; opts: SoftAlertOpts; resolve: () => void }
  | { kind: "prompt"; opts: SoftPromptOpts; resolve: (v: string | null) => void }
  | null;

let setHost: ((s: DialogState) => void) | null = null;
let queue: DialogState[] = [];

function pushDialog(next: DialogState) {
  if (!next) return;
  if (setHost) {
    setHost(next);
  } else {
    queue.push(next);
  }
}

/** Drop-in styled confirm. Returns true if user confirms. */
export function softConfirm(messageOrOpts: string | SoftConfirmOpts): Promise<boolean> {
  const opts: SoftConfirmOpts =
    typeof messageOrOpts === "string" ? { message: messageOrOpts } : messageOrOpts;
  return new Promise((resolve) => {
    pushDialog({ kind: "confirm", opts, resolve });
  });
}

/** Drop-in styled alert. */
export function softAlert(messageOrOpts: string | SoftAlertOpts): Promise<void> {
  const opts: SoftAlertOpts =
    typeof messageOrOpts === "string" ? { message: messageOrOpts } : messageOrOpts;
  return new Promise((resolve) => {
    pushDialog({ kind: "alert", opts, resolve });
  });
}

/** Drop-in styled prompt. Returns null if cancelled. */
export function softPrompt(messageOrOpts: string | SoftPromptOpts): Promise<string | null> {
  const opts: SoftPromptOpts =
    typeof messageOrOpts === "string" ? { message: messageOrOpts } : messageOrOpts;
  return new Promise((resolve) => {
    pushDialog({ kind: "prompt", opts, resolve });
  });
}

/** Mount once near app root. */
export function SoftDialogHost() {
  const [state, setState] = useState<DialogState>(null);
  const [promptValue, setPromptValue] = useState("");
  const [promptError, setPromptError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    setHost = (s) => {
      setState(s);
      if (s?.kind === "prompt") {
        setPromptValue(s.opts.defaultValue ?? "");
        setPromptError("");
      }
    };
    if (queue.length) {
      const first = queue.shift()!;
      setHost(first);
    }
    return () => {
      setHost = null;
    };
  }, []);

  useEffect(() => {
    if (state?.kind === "prompt") {
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [state]);

  if (!state) return null;

  function closeConfirm(ok: boolean) {
    if (state?.kind !== "confirm") return;
    const r = state.resolve;
    setState(null);
    r(ok);
    flushNext();
  }

  function closeAlert() {
    if (state?.kind !== "alert") return;
    const r = state.resolve;
    setState(null);
    r();
    flushNext();
  }

  function closePrompt(value: string | null) {
    if (state?.kind !== "prompt") return;
    const r = state.resolve;
    setState(null);
    r(value);
    flushNext();
  }

  function flushNext() {
    window.setTimeout(() => {
      if (queue.length && setHost) setHost(queue.shift()!);
    }, 0);
  }

  function submitPrompt() {
    if (state?.kind !== "prompt") return;
    const min = state.opts.minLength ?? 0;
    const v = promptValue;
    if (min > 0 && v.trim().length < min) {
      setPromptError(`至少 ${min} 个字符`);
      return;
    }
    closePrompt(v);
  }

  const title =
    state.kind === "confirm"
      ? state.opts.title ?? "请确认"
      : state.kind === "alert"
        ? state.opts.title ?? "提示"
        : state.opts.title ?? "请输入";

  const message = state.opts.message;
  const danger = state.kind === "confirm" && !!state.opts.danger;

  return createPortal(
    <ModalBackdrop
      className="soft-dialog-backdrop"
      role="presentation"
      onClose={() => {
        if (state.kind === "confirm") closeConfirm(false);
        else if (state.kind === "alert") closeAlert();
        else closePrompt(null);
      }}
    >
      <div
        className={`modal modal-sm soft-dialog${danger ? " soft-dialog-danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (state.kind === "confirm") closeConfirm(false);
            else if (state.kind === "alert") closeAlert();
            else closePrompt(null);
          }
          if (e.key === "Enter" && state.kind === "confirm") {
            e.preventDefault();
            closeConfirm(true);
          }
        }}
      >
        <div className="soft-dialog-head">
          <h3 id={titleId}>{title}</h3>
          <p>{message}</p>
        </div>

        {state.kind === "prompt" ? (
          <label className="soft-dialog-field">
            <span className="sr-only">输入</span>
            <input
              ref={inputRef}
              type={state.opts.inputType ?? "text"}
              value={promptValue}
              placeholder={state.opts.placeholder}
              onChange={(e) => {
                setPromptValue(e.target.value);
                setPromptError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitPrompt();
                }
              }}
            />
            {promptError ? <em className="soft-dialog-err">{promptError}</em> : null}
          </label>
        ) : null}

        <div className="modal-actions">
          {state.kind === "alert" ? (
            <button type="button" className="btn" onClick={closeAlert}>
              {state.opts.confirmText ?? "知道了"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  state.kind === "confirm" ? closeConfirm(false) : closePrompt(null)
                }
              >
                {state.opts.cancelText ?? "取消"}
              </button>
              <button
                type="button"
                className={`btn${danger ? " danger" : ""}`}
                onClick={() =>
                  state.kind === "confirm" ? closeConfirm(true) : submitPrompt()
                }
              >
                {state.opts.confirmText ?? (state.kind === "prompt" ? "确定" : "确定")}
              </button>
            </>
          )}
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
