import { NextResponse } from "next/server";
import { buildLeaderboard, readState } from "@/lib/store";

export async function GET() {
  const state = await readState();
  return NextResponse.json({
    artists: state.artists,
    votes: state.votes,
    leaderboard: buildLeaderboard(state),
  });
}
