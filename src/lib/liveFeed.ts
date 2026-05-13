import { promises as fs } from "fs";
import path from "path";
import vm from "vm";
import { getActiveEventId, getEventConfig, eventHistoryFileName } from "./eventConfig";

export type LiveStanding = {
  artistId: string;
  artist: string;
  song: string;
  points: number;
  runningOrder: number;
  delta: number;
};

export type LiveFeedResponse = {
  source: string;
  fetchedAt: string;
  activeArtist: LiveStanding | null;
  standings: LiveStanding[];
  usesPoints: boolean;
};

export type LiveHistoryFrame = {
  fetchedAt: string;
  activeArtist: LiveStanding | null;
  standings: LiveStanding[];
};

const dataDir = path.join(process.cwd(), "data");
const maxHistoryFrames = 400;

let previousPointsByArtistId = new Map<string, number>();

type LiveSourceSongInfo = [string, string, ...unknown[]];
type LiveSourceSongs = {
  songs: Record<string, LiveSourceSongInfo>;
};
type LiveSourceTableCell = string | number | null | undefined;
type LiveSourceTableRow = LiveSourceTableCell[];
type LiveSourceTableColumn = { ti?: string };
type LiveSourceTable = {
  ro?: LiveSourceTableRow[];
  at?: LiveSourceTableRow[];
  co?: LiveSourceTableColumn[];
};
type LiveSourceTables = Record<string, LiveSourceTable>;

function extractObject(source: string, variableName: string): string {
  const startRegex = new RegExp(`${variableName}\\s*=\\s*\\{`);
  const startMatch = startRegex.exec(source);
  if (!startMatch) {
    throw new Error(`Could not extract ${variableName}`);
  }

  const objStart = startMatch.index + startMatch[0].length - 1;
  let depth = 0;

  for (let i = objStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(objStart, i + 1);
      }
    }
  }

  throw new Error(`Could not extract ${variableName} — unbalanced braces`);
}

function evaluateObject(text: string): unknown {
  return vm.runInNewContext(`(${text})`, {}, { timeout: 1000 });
}

function getHistoryPath(eventId: string, subEvent?: string): string {
  return path.join(dataDir, eventHistoryFileName(eventId, subEvent));
}

async function ensureHistoryFile(historyPath: string) {
  try {
    await fs.access(historyPath);
  } catch {
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    await fs.writeFile(historyPath, JSON.stringify({ frames: [] }, null, 2), "utf8");
  }
}

export async function readLiveHistory(eventId?: string, subEvent?: string): Promise<LiveHistoryFrame[]> {
  const eid = eventId ?? (await getActiveEventId());
  const config = await getEventConfig(eid);
  const sub = subEvent ?? config.activeSubEvent;
  const hp = getHistoryPath(eid, sub);

  // Fall back to legacy file for melodifestivalen-2026
  try {
    await fs.access(hp);
  } catch {
    const legacyPath = path.join(dataDir, "live-history.json");
    try {
      await fs.access(legacyPath);
      const raw = await fs.readFile(legacyPath, "utf8");
      const parsed = JSON.parse(raw) as { frames?: LiveHistoryFrame[] };
      return parsed.frames ?? [];
    } catch {
      // no legacy either
    }
  }

  await ensureHistoryFile(hp);
  const raw = await fs.readFile(hp, "utf8");
  const parsed = JSON.parse(raw) as { frames?: LiveHistoryFrame[] };
  return parsed.frames ?? [];
}

function getFrameSignature(frame: LiveHistoryFrame) {
  return frame.standings.map((item) => `${item.artistId}:${item.points}`).join("|");
}

async function appendLiveHistoryFrame(frame: LiveHistoryFrame, eventId: string, subEvent?: string) {
  const hp = getHistoryPath(eventId, subEvent);
  await ensureHistoryFile(hp);

  const raw = await fs.readFile(hp, "utf8");
  const existingFrames = (JSON.parse(raw) as { frames?: LiveHistoryFrame[] }).frames ?? [];
  const lastFrame = existingFrames[existingFrames.length - 1];

  if (lastFrame && getFrameSignature(lastFrame) === getFrameSignature(frame)) {
    return;
  }

  const nextFrames = [...existingFrames, frame].slice(-maxHistoryFrames);
  await fs.writeFile(hp, JSON.stringify({ frames: nextFrames }, null, 2), "utf8");
}

export async function fetchLiveFeed(eventId?: string): Promise<LiveFeedResponse> {
  const eid = eventId ?? (await getActiveEventId());
  const config = await getEventConfig(eid);
  const source = config.liveSource.url;
  const isSemi = /semi/i.test(config.activeSubEvent);

  const fallbackStandings: LiveStanding[] = [...config.artists]
    .sort((left, right) => (left.runningOrder ?? 999) - (right.runningOrder ?? 999))
    .map((artist, index) => ({
      artistId: artist.id,
      artist: artist.name,
      song: artist.song ?? "Unknown",
      points: 0,
      runningOrder: artist.runningOrder ?? index + 1,
      delta: 0,
    }));

  const response = await fetch(source, {
    headers: { "User-Agent": "Mozilla/5.0 (eurovision-vote live parser)" },
    cache: "no-store",
  });

  if (!response.ok) {
    if (isSemi) {
      return {
        source,
        fetchedAt: new Date().toISOString(),
        activeArtist: null,
        standings: fallbackStandings,
        usesPoints: false,
      };
    }
    throw new Error(`Source fetch failed: ${response.status}`);
  }

  const html = await response.text();
  let nationalSongsRaw = "";
  let nationalTablesRaw = "";

  try {
    nationalSongsRaw = extractObject(html, "national_songs");
    nationalTablesRaw = extractObject(html, "national_tables");
  } catch (error) {
    if (isSemi) {
      return {
        source,
        fetchedAt: new Date().toISOString(),
        activeArtist: null,
        standings: fallbackStandings,
        usesPoints: false,
      };
    }
    throw error;
  }

  const nationalSongs = evaluateObject(nationalSongsRaw) as LiveSourceSongs;
  const nationalTables = evaluateObject(nationalTablesRaw) as LiveSourceTables;

  // Try configured table IDs first, then fall back to largest table
  let finalTable: LiveSourceTable | null = null;
  for (const tableId of config.liveSource.tableIds) {
    if (nationalTables[tableId]?.ro && nationalTables[tableId]?.at) {
      finalTable = nationalTables[tableId];
      break;
    }
  }

  if (!finalTable) {
    const minEntries = config.artists.length || 6;
    const candidates = Object.entries(nationalTables)
      .filter(([, table]) => (table.ro?.length ?? 0) >= minEntries && (table.at?.length ?? 0) >= minEntries)
      .sort(([, a], [, b]) => (b.ro?.length ?? 0) - (a.ro?.length ?? 0));

    finalTable = candidates[0]?.[1];
  }

  if (!finalTable?.ro || !finalTable?.at) {
    throw new Error("No scoring table available in source yet");
  }

  // Detect column layout from headers
  const columns = (finalTable.co ?? []) as { ti: string }[];
  const totalIdx = columns.findIndex((col) => /total|points/i.test(col.ti));
  const runningIdx = columns.findIndex((col) => /running/i.test(col.ti));
  const pointsCol = totalIdx >= 0 ? totalIdx : 2;
  const runningCol = runningIdx >= 0 ? runningIdx : columns.length - 1;

  const standings: LiveStanding[] = finalTable.ro.map((row, index: number) => {
    const songRow = finalTable.at?.[index];
    const songId = String(songRow?.[0] ?? "");
    const songInfo = nationalSongs.songs[songId] ?? ["Unknown", "Unknown"];
    const artist = String(songInfo[0] ?? "Unknown");
    const song = String(songInfo[1] ?? "Unknown");
    const points = Number(row?.[pointsCol] ?? 0);
    const runningOrder = Number(row?.[runningCol] ?? index + 1);

    const previous = previousPointsByArtistId.get(songId) ?? points;
    const delta = Math.max(0, points - previous);

    return { artistId: songId, artist, song, points, runningOrder, delta };
  });

  previousPointsByArtistId = new Map(standings.map((item) => [item.artistId, item.points]));

  const byPoints = [...standings].sort((left, right) => right.points - left.points);
  const byDelta = [...standings].sort((left, right) => right.delta - left.delta);
  const activeArtist = byDelta[0]?.delta > 0 ? byDelta[0] : byPoints[0] ?? null;

  const payload: LiveFeedResponse = {
    source,
    fetchedAt: new Date().toISOString(),
    activeArtist,
    standings: byPoints,
    usesPoints: !isSemi,
  };

  await appendLiveHistoryFrame(
    { fetchedAt: payload.fetchedAt, activeArtist: payload.activeArtist, standings: payload.standings },
    eid,
    config.activeSubEvent
  );

  return payload;
}

// Keep backward compat
export const fetchMelodiLiveFeed = fetchLiveFeed;
