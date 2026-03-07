import { promises as fs } from "fs";
import path from "path";

type Artist = { id: string; name: string };
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

type State = { artists: Artist[]; votes: Vote[] };

const stateFilePath = path.join(process.cwd(), "data", "state.json");

async function ensureStateFile() {
  try {
    await fs.access(stateFilePath);
  } catch {
    await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
    await fs.writeFile(
      stateFilePath,
      JSON.stringify({ artists: [], votes: [] } satisfies State, null, 2),
      "utf8"
    );
  }
}

export async function readState(): Promise<State> {
  await ensureStateFile();
  const content = await fs.readFile(stateFilePath, "utf8");
  return JSON.parse(content) as State;
}

export async function writeState(nextState: State): Promise<void> {
  await fs.writeFile(stateFilePath, JSON.stringify(nextState, null, 2), "utf8");
}

export async function upsertVote(input: {
  voter: string;
  artistId: string;
  song: number;
  show: number;
}) {
  const safeSong = Math.max(1, Math.min(10, Number(input.song)));
  const safeShow = Math.max(1, Math.min(10, Number(input.show)));
  const total = safeSong + safeShow;

  const state = await readState();
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

  await writeState(state);
  return state;
}

export async function addArtist(name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) return null;

  const state = await readState();
  const duplicate = state.artists.find(
    (artist) => artist.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicate) return state;

  state.artists.push({ id: crypto.randomUUID(), name: trimmedName });
  await writeState(state);
  return state;
}

export function buildLeaderboard(state: State) {
  return state.artists
    .map((artist) => {
      const artistVotes = state.votes.filter((vote) => vote.artistId === artist.id);
      const voteCount = artistVotes.length;
      const songAverage = voteCount
        ? artistVotes.reduce((sum, vote) => sum + vote.song, 0) / voteCount
        : 0;
      const showAverage = voteCount
        ? artistVotes.reduce((sum, vote) => sum + vote.show, 0) / voteCount
        : 0;
      const totalAverage = voteCount
        ? artistVotes.reduce((sum, vote) => sum + vote.total, 0) / voteCount
        : 0;

      return {
        artistId: artist.id,
        artistName: artist.name,
        voteCount,
        songAverage,
        showAverage,
        totalAverage,
      };
    })
    .sort((left, right) => right.totalAverage - left.totalAverage || right.voteCount - left.voteCount);
}
