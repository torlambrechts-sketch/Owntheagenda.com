import React from "react";

// A small, dependency-free markdown renderer for help/science content.
// Builds React nodes (never dangerouslySetInnerHTML) and only allows http(s)
// or relative links, so stored content can't inject markup or scripts.

function inline(text: string, kp: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={`${kp}-${i}`}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<em key={`${kp}-${i}`}>{m[3]}</em>);
    else if (m[4] !== undefined) nodes.push(<code key={`${kp}-${i}`}>{m[4]}</code>);
    else if (m[5] !== undefined) {
      const href = m[6];
      const safe = /^(https?:\/\/|\/)/.test(href) ? href : "#";
      const external = safe.startsWith("http");
      nodes.push(
        <a key={`${kp}-${i}`} href={safe} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
          {m[5]}
        </a>,
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BLOCK_START = /^(#{2,3} |[-*] |\d+\. |> )/;

export function Markdown({ children }: { children: string }) {
  const lines = (children ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("### ")) { blocks.push(<h3 key={key++}>{inline(line.slice(4), `h3-${key}`)}</h3>); i++; continue; }
    if (line.startsWith("## ")) { blocks.push(<h2 key={key++}>{inline(line.slice(3), `h2-${key}`)}</h2>); i++; continue; }

    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) { buf.push(lines[i].slice(2)); i++; }
      blocks.push(<blockquote key={key++}>{inline(buf.join(" "), `bq-${key}`)}</blockquote>);
      continue;
    }
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) { items.push(lines[i].replace(/^[-*] /, "")); i++; }
      blocks.push(<ul key={key++}>{items.map((it, j) => <li key={j}>{inline(it, `ul-${key}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      blocks.push(<ol key={key++}>{items.map((it, j) => <li key={j}>{inline(it, `ol-${key}-${j}`)}</li>)}</ol>);
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) { buf.push(lines[i]); i++; }
    blocks.push(<p key={key++}>{inline(buf.join(" "), `p-${key}`)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
