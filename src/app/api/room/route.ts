import { NextResponse } from "next/server";
import { createRoom, roomExists } from "@/lib/store";
import { normalizeRoomCode } from "@/lib/rooms";

type RoomRequest = {
  action?: "create" | "join";
  room?: string;
  voter?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RoomRequest;

    if (body.action === "create") {
      const roomCode = await createRoom(body.voter);
      return NextResponse.json({ roomCode }, { status: 201 });
    }

    if (body.action === "join") {
      const roomCode = normalizeRoomCode(body.room ?? "");
      if (!roomCode) {
        return NextResponse.json({ error: "Invalid room code." }, { status: 400 });
      }

      const exists = await roomExists(roomCode);
      if (!exists) {
        return NextResponse.json({ error: "Room not found." }, { status: 404 });
      }

      return NextResponse.json({ roomCode }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "Room operation failed.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

