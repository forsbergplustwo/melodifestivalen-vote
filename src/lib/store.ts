import { promises as fs } from "fs";
import path from "path";
import { getActiveEventId, getEventConfig, eventStateFileName } from "./eventConfig";

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

type State = { eventId: string; artists: Artist[]; votes: Vote[] };

const dataDir = path.join(process.cwd(), "data");

function stateFilePath(eventId: string, subEvent?: string): string {
  return path.join(dataDir, eventStateFileName(eventId, subEvent));
}

async function ensureStateFile(filePath: string, eventId: string) {
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

    await fs.writeFile(filePath, JSON.stringify({ eventId, artists, votes: [] } satisfies State, null, 2), "utf8");
  }
}

export async function readState(eventId?: string, subEvent?: string): Promise<State> {
  const eid = eventId ?? (await getActiveEventId());
  const sub = subEvent ?? (await getEventConfig(eid).then((c) => c.activeSubEvent).catch(() => undefined));
  const fp = stateFilePath(eid, sub);
  await ensureStateFile(fp, eid);
  const content = await fs.readFile(fp, "utf8");
  return JSON.parse(content) as State;
}

export async function writeState(nextState: State, eventId?: string, subEvent?: string): Promise<void> {
  const eid = eventId ?? nextState.eventId ?? (await getActiveEventId());
  const sub = subEvent ?? (await getEventConfig(eid).then((c) => c.activeSubEvent).catch(() => undefined));
  const fp = stateFilePath(eid, sub);
  await fs.writeFile(fp, JSON.stringify(nextState, null, 2), "utf8");
}

export async function upsertVote(input: { voter: string; artistId: string; song: number; show: number }, eventId?: string) {
  const safeSong = Math.max(1, Math.min(10, Number(input.song)));
  const safeShow = Math.max(1, Math.min(10, Number(input.show)));
  const total = safeSong + safeShow;

  const eid = eventId ?? (await getActiveEventId());
  const state = await readState(eid);
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

  await writeState(state, eid);
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
        country: (artist as any).country ?? "",
        flag: (artist as any).flag ?? "",
        imageUrl: artist.imageUrl ?? "",
        voteCount,
        songAverage,
        showAverage,
        totalAverage,
      };
    })
    .sort((left, right) => right.totalAverage - left.totalAverage || right.voteCount - left.voteCount);
}
