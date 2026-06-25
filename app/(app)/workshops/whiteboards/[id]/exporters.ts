"use client";

import { CLIP_PATHS, connectorD, objH, objW, type WBObject } from "../wb";

// ---------------------------------------------------------------------------
// Client-side board export. The board is first serialised to a self-contained
// SVG string, then rasterised onto a <canvas> for PNG / PPTX. JSON export is a
// straight object dump; import re-hydrates it.
// ---------------------------------------------------------------------------

type Bounds = { minX: number; minY: number; w: number; h: number };

function boundsOf(objects: WBObject[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objects) {
    if (o.kind === "connector") continue;
    if (o.kind === "pen" || o.kind === "marker") {
      for (const [x, y] of o.points ?? []) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
      continue;
    }
    minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + objW(o)); maxY = Math.max(maxY, o.y + objH(o));
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, w: 800, h: 600 };
  const pad = 40;
  return { minX: minX - pad, minY: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function polyPoints(kind: string, x: number, y: number, w: number, h: number): string {
  const map: Record<string, number[][]> = {
    diamond: [[50, 0], [100, 50], [50, 100], [0, 50]],
    triangle: [[50, 0], [100, 100], [0, 100]],
    hexagon: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]],
    parallelogram: [[25, 0], [100, 0], [75, 100], [0, 100]],
    star: [[50, 0], [61, 35], [98, 35], [68, 57], [79, 91], [50, 70], [21, 91], [32, 57], [2, 35], [39, 35]],
  };
  return (map[kind] ?? []).map(([px, py]) => `${x + (px / 100) * w},${y + (py / 100) * h}`).join(" ");
}

function wrapText(text: string, x: number, y: number, w: number, color: string, size = 13, anchor = "middle"): string {
  if (!text) return "";
  const charW = size * 0.55;
  const perLine = Math.max(1, Math.floor(w / charW));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if ((cur + " " + word).trim().length > perLine && cur) { lines.push(cur); cur = word; }
    else cur = (cur + " " + word).trim();
  }
  if (cur) lines.push(cur);
  return lines.map((ln, i) =>
    `<text x="${x}" y="${y + i * (size + 4)}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-family="sans-serif">${esc(ln)}</text>`,
  ).join("");
}

export function boardToSVG(objects: WBObject[]): { svg: string; w: number; h: number } {
  const b = boundsOf(objects);
  const byId = new Map(objects.map((o) => [o.id, o]));
  const parts: string[] = [];
  parts.push(`<rect x="${b.minX}" y="${b.minY}" width="${b.w}" height="${b.h}" fill="#ffffff"/>`);

  // connectors
  for (const c of objects.filter((o) => o.kind === "connector")) {
    const s = c.srcId ? byId.get(c.srcId) : null;
    const d = c.dstId ? byId.get(c.dstId) : null;
    if (!s || !d) continue;
    const { d: path } = connectorD(s, d, c.lineStyle ?? "curved");
    parts.push(`<path d="${path}" fill="none" stroke="${c.color ?? "#737373"}" stroke-width="2"/>`);
  }
  // pen / marker
  for (const o of objects.filter((o) => o.kind === "pen" || o.kind === "marker")) {
    const pts = (o.points ?? []).map(([x, y]) => `${x},${y}`).join(" ");
    parts.push(`<polyline points="${pts}" fill="none" stroke="${o.color ?? "#33312a"}" stroke-width="${o.width ?? 3}" stroke-linecap="round" stroke-linejoin="round" opacity="${o.variant === "marker" ? 0.4 : 1}"/>`);
  }
  // nodes
  for (const o of objects.filter((o) => o.kind !== "connector" && o.kind !== "pen" && o.kind !== "marker")) {
    const w = objW(o), h = objH(o);
    if (o.kind === "text") {
      parts.push(wrapText(o.text || "Text", o.x, o.y + (o.fontSize ?? 18), w, o.color ?? "#333", o.fontSize ?? 18, "start"));
      continue;
    }
    if (o.kind === "note") {
      parts.push(`<rect x="${o.x}" y="${o.y}" width="${w}" height="${h}" rx="4" fill="${o.fill ?? "#fef9c3"}"/>`);
      parts.push(wrapText(o.text, o.x + 10, o.y + 22, w - 20, o.color ?? "#5b5536", 13, "start"));
      continue;
    }
    const fill = o.fill ?? "#fff", stroke = o.stroke ?? "#cfcdc4";
    if (o.kind === "ellipse") {
      parts.push(`<ellipse cx="${o.x + w / 2}" cy="${o.y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    } else if (CLIP_PATHS[o.kind]) {
      parts.push(`<polygon points="${polyPoints(o.kind, o.x, o.y, w, h)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    } else {
      const rx = o.kind === "roundrect" ? 14 : o.kind === "pill" ? h / 2 : 4;
      parts.push(`<rect x="${o.x}" y="${o.y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    }
    if (o.text) parts.push(wrapText(o.text, o.x + w / 2, o.y + h / 2 + 4, w - 12, o.color ?? "#33312a", 13, "middle"));
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h}" viewBox="${b.minX} ${b.minY} ${b.w} ${b.h}">${parts.join("")}</svg>`;
  return { svg, w: b.w, h: b.h };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s: string): string {
  return (s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "whiteboard");
}

async function rasterise(objects: WBObject[], scale = 2): Promise<{ blob: Blob; w: number; h: number }> {
  const { svg, w, h } = boardToSVG(objects);
  const img = new Image();
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("render")); img.src = url; });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
  return { blob, w: canvas.width, h: canvas.height };
}

export async function exportPNG(title: string, objects: WBObject[]) {
  const { blob } = await rasterise(objects, 2);
  download(blob, `${slug(title)}.png`);
}

export function exportJSON(title: string, objects: WBObject[]) {
  const payload = { version: 1, title, objects };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${slug(title)}.json`);
}

// PPTX: a single 16:9 slide embedding the board PNG. Hand-rolled OOXML zip
// (store-only, with correct CRC32s) so we avoid pulling in a dependency.
export async function exportPPTX(title: string, objects: WBObject[]) {
  const { blob, w, h } = await rasterise(objects, 2);
  const png = new Uint8Array(await blob.arrayBuffer());

  // EMU: 914400 per inch. Slide = 13.333in x 7.5in (16:9).
  const SW = 12192000, SH = 6858000;
  const ar = w / h;
  let iw = SW, ih = Math.round(SW / ar);
  if (ih > SH) { ih = SH; iw = Math.round(SH * ar); }
  const ox = Math.round((SW - iw) / 2), oy = Math.round((SH - ih) / 2);

  const files: { name: string; data: Uint8Array }[] = [];
  const text = (s: string) => new TextEncoder().encode(s);

  files.push({ name: "[Content_Types].xml", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/>` +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>` +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `</Types>`) });

  files.push({ name: "_rels/.rels", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
    `</Relationships>`) });

  files.push({ name: "ppt/presentation.xml", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>` +
    `<p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="${SH}" cy="${SW}"/></p:presentation>`) });

  files.push({ name: "ppt/_rels/presentation.xml.rels", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>` +
    `</Relationships>`) });

  files.push({ name: "ppt/slideMasters/slideMaster1.xml", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`) });

  files.push({ name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `</Relationships>`) });

  files.push({ name: "ppt/slideLayouts/slideLayout1.xml", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">` +
    `<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>`) });

  files.push({ name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
    `</Relationships>`) });

  files.push({ name: "ppt/slides/slide1.xml", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
    `<p:pic><p:nvPicPr><p:cNvPr id="2" name="${esc(title)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${ox}" y="${oy}"/><a:ext cx="${iw}" cy="${ih}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`) });

  files.push({ name: "ppt/slides/_rels/slide1.xml.rels", data: text(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>` +
    `</Relationships>`) });

  files.push({ name: "ppt/media/image1.png", data: png });

  const zip = buildZip(files);
  download(new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), `${slug(title)}.pptx`);
}

export function parseImport(raw: string): WBObject[] | null {
  try {
    const data = JSON.parse(raw);
    const objs = Array.isArray(data) ? data : data.objects;
    if (!Array.isArray(objs)) return null;
    return objs.map((o: Record<string, unknown>) => ({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      kind: String(o.kind ?? "note"),
      text: String(o.text ?? ""),
      fill: (o.fill as string) ?? null, stroke: (o.stroke as string) ?? null, color: (o.color as string) ?? null,
      x: Number(o.x ?? 0), y: Number(o.y ?? 0),
      w: o.w == null ? null : Number(o.w), h: o.h == null ? null : Number(o.h),
      fontSize: o.fontSize == null ? null : Number(o.fontSize),
      points: (o.points as number[][]) ?? null,
      width: o.width == null ? null : Number(o.width),
      opacity: o.opacity == null ? null : Number(o.opacity),
      variant: (o.variant as string) ?? null,
      srcId: (o.srcId as string) ?? null, dstId: (o.dstId as string) ?? null,
      lineStyle: (o.lineStyle as string) ?? null,
      z: Number(o.z ?? 0),
      comments: Array.isArray(o.comments) ? o.comments : [],
      reactions: (o.reactions && typeof o.reactions === "object" ? o.reactions : {}) as Record<string, number>,
      authorId: null, authorName: null,
    })) as WBObject[];
  } catch {
    return null;
  }
}

// ---- minimal store-only ZIP (no compression) with CRC32 ------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, 0, true); lv.setUint16(12, 0, true); // time/date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(f.data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const l of locals) { out.set(l, pos); pos += l.length; }
  for (const c of centrals) { out.set(c, pos); pos += c.length; }
  out.set(end, pos);
  return out;
}
