import { NextResponse } from "next/server";
import { buildLeaderboard, upsertVote } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    voter?: string;
    artistId?: string;
    song?: number;
    show?: number;
  };

  if (!body.voter || !body.artistId) {
    return NextResponse.json({ error: "Missing voter or artistId." }, { status: 400 });
  }

  const state = await upsertVote({
    voter: body.voter,
    artistId: body.artistId,
    song: Number(body.song ?? 1),
    show: Number(body.show ?? 1),
  });

  return NextResponse.json({
    artists: state.artists,
    votes: state.votes,
    leaderboard: buildLeaderboard(state),
  });
}
