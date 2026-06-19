"use client";

import { useState } from "react";

export function ShareActions({ markdown, fileBase }: { markdown: string; fileBase: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the download button is the fallback */
    }
  }
  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="share-actions">
      <button className="btn-sec sm" onClick={copy}>{copied ? "✓ Copied" : "Copy Markdown"}</button>
      <button className="btn-sec sm" onClick={download}>Download .md</button>
      <button className="btn-prim sm" onClick={() => window.print()}>Print / PDF</button>
    </div>
  );
}
