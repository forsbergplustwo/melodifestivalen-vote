import { NextResponse } from "next/server";
import { buildLeaderboard, readState } from "@/lib/store";
import { normalizeRoomCode } from "@/lib/rooms";

export async function GET(request: Request) {
  const roomCode = normalizeRoomCode(new URL(request.url).searchParams.get("room") ?? "");
  if (!roomCode) {
    return NextResponse.json({ error: "Missing or invalid room code." }, { status: 400 });
  }

  const state = await readState(undefined, undefined, roomCode);
  return NextResponse.json({
    artists: state.artists,
    votes: state.votes,
    leaderboard: buildLeaderboard(state),
    presenceEvents: state.presenceEvents,
    participants: state.participants,
    reactionEvents: state.reactionEvents,
  });
}
