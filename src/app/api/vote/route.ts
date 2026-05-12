import { NextResponse } from "next/server";
import { buildLeaderboard, upsertVote } from "@/lib/store";
import { normalizeRoomCode } from "@/lib/rooms";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    voter?: string;
    artistId?: string;
    song?: number;
    show?: number;
    room?: string;
  };

  const roomCode = normalizeRoomCode(body.room ?? "");
  if (!body.voter || !body.artistId || !roomCode) {
    return NextResponse.json({ error: "Missing or invalid voter, artistId, or room." }, { status: 400 });
  }

  const state = await upsertVote({
    voter: body.voter,
    artistId: body.artistId,
    song: Number(body.song ?? 1),
    show: Number(body.show ?? 1),
  }, undefined, roomCode);

  return NextResponse.json({
    artists: state.artists,
    votes: state.votes,
    leaderboard: buildLeaderboard(state),
  });
}
