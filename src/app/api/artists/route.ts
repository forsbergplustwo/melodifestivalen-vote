import { NextResponse } from "next/server";
import { addArtist, buildLeaderboard, readState } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Artist name is required." }, { status: 400 });
  }

  const nextState = await addArtist(body.name);
  if (!nextState) {
    return NextResponse.json({ error: "Artist name is required." }, { status: 400 });
  }

  return NextResponse.json({
    artists: nextState.artists,
    votes: nextState.votes,
    leaderboard: buildLeaderboard(nextState),
  });
}

export async function GET() {
  const state = await readState();
  return NextResponse.json({
    artists: state.artists,
    votes: state.votes,
    leaderboard: buildLeaderboard(state),
  });
}
