import { promises as fs } from "fs";
import path from "path";
import { getActiveEventId, getEventConfig, eventStateFileName } from "./eventConfig";
import { generateRoomCode, normalizeRoomCode } from "./rooms";
import { normalizeEurovisionPoints } from "./eurovisionPoints";

type Artist = { id: string; name: string; song?: string; country?: string; flag?: string; imageUrl?: string };
type Vote = {
  id: string;
  voter: string;
  artistId: string;
  song: number;
  show: number;
  total: number;
  createdAt: string;
  updatedAt: string;
};

type State = { eventId: string; roomCode: string; artists: Artist[]; votes: Vote[] };

const dataDir = path.join(process.cwd(), "data");
const defaultRoomCode = "GLOBAL";

function normalizeRoomOrThrow(roomCode?: string) {
  const normalized = normalizeRoomCode(roomCode ?? defaultRoomCode);
  if (!normalized) {
    throw new Error("Invalid room code");
  }
  return normalized;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function roomStateFilePath(eventId: string, roomCode: string, subEvent?: string): string {
  const eventSegment = safeSegment(eventId);
  const subEventSegment = safeSegment(subEvent ?? "default");
  return path.join(dataDir, "rooms", eventSegment, subEventSegment, `${roomCode}.json`);
}

function legacyStateFilePath(eventId: string, subEvent?: string): string {
  return path.join(dataDir, eventStateFileName(eventId, subEvent));
}

async function ensureStateFile(filePath: string, eventId: string, roomCode: string) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Bootstrap from event config
    let artists: Artist[] = [];
    try {
      const config = await getEventConfig(eventId);
      artists = config.artists.map((a) => ({
        id: a.id,
        name: a.name,
        song: a.song,
        country: a.country,
        flag: a.flag,
        imageUrl: a.imageUrl,
      }));
    } catch {
      // no config found, empty artists
    }

    await fs.writeFile(filePath, JSON.stringify({ eventId, roomCode, artists, votes: [] } satisfies State, null, 2), "utf8");
  }
}

export async function roomExists(roomCode: string, eventId?: string, subEvent?: string): Promise<boolean> {
  const normalizedRoomCode = normalizeRoomOrThrow(roomCode);
  const eid = eventId ?? (await getActiveEventId());
  const sub = subEvent ?? (await getEventConfig(eid).then((c) => c.activeSubEvent).catch(() => undefined));
  const fp = roomStateFilePath(eid, normalizedRoomCode, sub);
  try {
    await fs.access(fp);
    return true;
  } catch {
    return false;
  }
}

export async function createRoom(eventId?: string, subEvent?: string): Promise<string> {
  const eid = eventId ?? (await getActiveEventId());
  const sub = subEvent ?? (await getEventConfig(eid).then((c) => c.activeSubEvent).catch(() => undefined));

  for (let attempt = 0; attempt < 12; attempt++) {
    const nextRoomCode = generateRoomCode();
    const exists = await roomExists(nextRoomCode, eid, sub);
    if (exists) continue;
    await ensureStateFile(roomStateFilePath(eid, nextRoomCode, sub), eid, nextRoomCode);
    return nextRoomCode;
  }

  throw new Error("Could not generate a unique room code");
}

export async function readState(eventId?: string, subEvent?: string, roomCode?: string): Promise<State> {
  const normalizedRoomCode = normalizeRoomOrThrow(roomCode);
  const eid = eventId ?? (await getActiveEventId());
  const sub = subEvent ?? (await getEventConfig(eid).then((c) => c.activeSubEvent).catch(() => undefined));
  const fp = roomStateFilePath(eid, normalizedRoomCode, sub);
  if (normalizedRoomCode === defaultRoomCode) {
    try {
      await fs.access(fp);
    } catch {
      const legacyPath = legacyStateFilePath(eid, sub);
      try {
        await fs.access(legacyPath);
        await fs.mkdir(path.dirname(fp), { recursive: true });
        await fs.copyFile(legacyPath, fp);
      } catch {
        // no legacy file found, continue with fresh room state
      }
    }
  }
  await ensureStateFile(fp, eid, normalizedRoomCode);
  const content = await fs.readFile(fp, "utf8");
  return JSON.parse(content) as State;
}

export async function writeState(nextState: State, eventId?: string, subEvent?: string, roomCode?: string): Promise<void> {
  const normalizedRoomCode = normalizeRoomOrThrow(roomCode ?? nextState.roomCode);
  const eid = eventId ?? nextState.eventId ?? (await getActiveEventId());
  const sub = subEvent ?? (await getEventConfig(eid).then((c) => c.activeSubEvent).catch(() => undefined));
  const fp = roomStateFilePath(eid, normalizedRoomCode, sub);
  await fs.writeFile(fp, JSON.stringify(nextState, null, 2), "utf8");
}

export async function upsertVote(input: { voter: string; artistId: string; song: number; show: number }, eventId?: string, roomCode?: string) {
  const safeSong = normalizeEurovisionPoints(input.song);
  const safeShow = normalizeEurovisionPoints(input.show);
  const total = safeSong + safeShow;

  const eid = eventId ?? (await getActiveEventId());
  const state = await readState(eid, undefined, roomCode);
  const existingVote = state.votes.find(
    (vote) => vote.voter.toLowerCase() === input.voter.toLowerCase() && vote.artistId === input.artistId
  );
  const nowIso = new Date().toISOString();

  if (existingVote) {
    existingVote.song = safeSong;
    existingVote.show = safeShow;
    existingVote.total = total;
    existingVote.updatedAt = nowIso;
  } else {
    state.votes.push({
      id: crypto.randomUUID(),
      voter: input.voter.trim(),
      artistId: input.artistId,
      song: safeSong,
      show: safeShow,
      total,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  await writeState(state, eid, undefined, roomCode);
  return state;
}

export function buildLeaderboard(state: State) {
  return state.artists
    .map((artist) => {
      const artistVotes = state.votes.filter((vote) => vote.artistId === artist.id);
      const voteCount = artistVotes.length;
      const songAverage = voteCount ? artistVotes.reduce((sum, vote) => sum + vote.song, 0) / voteCount : 0;
      const showAverage = voteCount ? artistVotes.reduce((sum, vote) => sum + vote.show, 0) / voteCount : 0;
      const totalAverage = voteCount ? artistVotes.reduce((sum, vote) => sum + vote.total, 0) / voteCount : 0;

      return {
        artistId: artist.id,
        artistName: artist.name,
        songTitle: artist.song ?? "",
        country: artist.country ?? "",
        flag: artist.flag ?? "",
        imageUrl: artist.imageUrl ?? "",
        voteCount,
        songAverage,
        showAverage,
        totalAverage,
      };
    })
    .sort((left, right) => right.totalAverage - left.totalAverage || right.voteCount - left.voteCount);
}
