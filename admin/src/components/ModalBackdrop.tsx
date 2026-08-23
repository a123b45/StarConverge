import { useRef, type HTMLAttributes, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "onClick" | "onMouseDown" | "onPointerDown">;

/**
 * Modal dimmer that only closes when the pointer both went down and up
 * on the backdrop. Selecting / pasting inside the card and releasing
 * outside no longer dismisses the dialog.
 */
export default function ModalBackdrop({
  children,
  onClose,
  className = "",
  ...rest
}: Props) {
  const startedOnBackdrop = useRef(false);

  return (
    <div
      {...rest}
      className={["modal-backdrop", className].filter(Boolean).join(" ")}
      onPointerDown={(e) => {
        startedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (startedOnBackdrop.current && e.target === e.currentTarget) {
          onClose?.();
        }
        startedOnBackdrop.current = false;
      }}
    >
      {children}
    </div>
  );
}
