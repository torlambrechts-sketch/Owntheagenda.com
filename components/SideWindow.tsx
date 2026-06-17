"use client";

import { useEffect } from "react";

export function SideWindow({
  open,
  onClose,
  title,
  subtitle,
  size,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: "compact" | "wide";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`scrim${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`sw ${size ?? ""}${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sw-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <div className="sub">{subtitle}</div> : null}
          </div>
          <button className="sw-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sw-body">{children}</div>
        {footer ? <div className="sw-foot">{footer}</div> : null}
      </aside>
    </>
  );
}
