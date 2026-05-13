import { NextResponse } from "next/server";
import { buildLeaderboard, registerPresence } from "@/lib/store";
import { normalizeRoomCode } from "@/lib/rooms";

export async function POST(request: Request) {
  const body = (await request.json()) as { room?: string; voter?: string };
  const roomCode = normalizeRoomCode(body.room ?? "");
  const voter = (body.voter ?? "").trim();

  if (!roomCode || !voter) {
    return NextResponse.json({ error: "Missing or invalid room/voter." }, { status: 400 });
  }

  const state = await registerPresence({ voter }, undefined, roomCode);
  return NextResponse.json({
    artists: state.artists,
    votes: state.votes,
    leaderboard: buildLeaderboard(state),
    presenceEvents: state.presenceEvents,
    participants: state.participants,
    reactionEvents: state.reactionEvents,
  });
}
