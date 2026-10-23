"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { Button } from "./button";

/** Native modal dialog supplies focus containment, an inert background and Esc.
 * The portal keeps it outside clipped cards and the dashboard layout. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    // React's autoFocus runs while a freshly mounted <dialog> is still closed.
    // Focus the first editable field only after entering the modal top layer.
    element
      .querySelector<HTMLElement>(
        'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)',
      )
      ?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => {
        if (trigger instanceof HTMLElement && trigger.isConnected)
          trigger.focus();
      });
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl open:flex backdrop:bg-foreground/35 backdrop:backdrop-blur-[2px]"
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || !dismissible) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose();
      }}
    >
      <div className="flex shrink-0 items-start gap-4 border-b border-border bg-secondary/40 px-6 py-5">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="break-words text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted">
              {description}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 min-h-8"
          aria-label="關閉視窗"
          disabled={!dismissible}
          onClick={onClose}
        >
          <IconX className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 overflow-y-auto p-6">{children}</div>
    </dialog>,
    document.body,
  );
}
