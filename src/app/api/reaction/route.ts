import { NextResponse } from "next/server";
import { buildLeaderboard, registerReaction } from "@/lib/store";
import { normalizeRoomCode } from "@/lib/rooms";

export async function POST(request: Request) {
  const body = (await request.json()) as { room?: string; voter?: string; artistId?: string; emoji?: string; exact?: boolean };
  const roomCode = normalizeRoomCode(body.room ?? "");
  const voter = (body.voter ?? "").trim();
  const artistId = (body.artistId ?? "").trim();
  const emoji = (body.emoji ?? "").trim();
  const exact = Boolean(body.exact);
  const allowedEmojis = new Set(["😳", "👎", "😂", "👏", "👍"]);
  const isLikelyEmoji = /\p{Extended_Pictographic}/u.test(emoji);

  if (!roomCode || !voter || !artistId || !emoji || (!exact && !allowedEmojis.has(emoji)) || (exact && !isLikelyEmoji)) {
    return NextResponse.json({ error: "Missing or invalid room/voter/artistId/emoji." }, { status: 400 });
  }

  const state = await registerReaction({ voter, artistId, emoji, exact }, undefined, roomCode);
  return NextResponse.json({
    artists: state.artists,
    votes: state.votes,
    leaderboard: buildLeaderboard(state),
    presenceEvents: state.presenceEvents,
    participants: state.participants,
    reactionEvents: state.reactionEvents,
  });
}
