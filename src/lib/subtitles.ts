/**
 * Minimal SRT / WebVTT cue parsing for study sync (start/end in seconds).
 */

export interface SubtitleCue {
  index: number;
  start: number;
  end: number;
  text: string;
}

function parseSrtTime(part: string): number {
  const m = part.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4]);
  return h * 3600 + min * 60 + s + ms / 1000;
}

export function parseSRT(source: string): SubtitleCue[] {
  const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 2) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0].trim())) i = 1;
    const timeLine = lines[i];
    const arrow = timeLine.includes("-->") ? "-->" : null;
    if (!arrow) continue;
    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim());
    const start = parseSrtTime(startRaw);
    const end = parseSrtTime(endRaw.split(/\s/)[0] || endRaw);
    const textLines = lines.slice(i + 1);
    const text = textLines.join(" ").replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    cues.push({ index: cues.length + 1, start, end, text });
  }
  return cues;
}

function parseVttTimestamp(raw: string): number {
  const m = raw.trim().match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4]);
  return h * 3600 + min * 60 + s + ms / 1000;
}

export function parseVTT(source: string): SubtitleCue[] {
  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const cues: SubtitleCue[] = [];
  let i = 0;
  if (lines[0]?.startsWith("WEBVTT")) i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("NOTE") || line === "WEBVTT") continue;
    if (line.includes("-->")) {
      const [a, b] = line.split("-->").map((s) => s.trim());
      const start = parseVttTimestamp(a);
      const endPart = b.split(/\s/)[0] || b;
      const end = parseVttTimestamp(endPart);
      const textParts: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        textParts.push(lines[i].trim());
        i++;
      }
      const text = textParts.join(" ").replace(/<[^>]+>/g, "").trim();
      if (text) cues.push({ index: cues.length + 1, start, end, text });
    }
  }
  return cues;
}

export function parseSubtitleFile(name: string, content: string): SubtitleCue[] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".vtt")) return parseVTT(content);
  return parseSRT(content);
}
