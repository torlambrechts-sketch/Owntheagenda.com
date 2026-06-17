"use client";

export function PrintButton() {
  return (
    <button className="btn-sec no-print" onClick={() => window.print()}>
      Print / PDF
    </button>
  );
}
