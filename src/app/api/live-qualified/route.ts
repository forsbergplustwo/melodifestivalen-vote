import { NextRequest, NextResponse } from "next/server";
import { getQualifiedState, setQualified } from "@/lib/liveQualified";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId") ?? "";
  const state = await getQualifiedState();
  return NextResponse.json({
    eventId: state.eventId,
    subEvent: state.subEvent,
    ownerClientId: state.ownerClientId ?? null,
    canEdit: Boolean(clientId) && (!state.ownerClientId || state.ownerClientId === clientId),
    qualifiedByArtistId: state.qualifiedByArtistId,
    updatedAt: state.updatedAt,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { clientId?: string; artistId?: string; qualified?: boolean };
    if (!body.clientId || !body.artistId || typeof body.qualified !== "boolean") {
      return NextResponse.json({ error: "Missing clientId, artistId, or qualified" }, { status: 400 });
    }

    const state = await setQualified({ clientId: body.clientId, artistId: body.artistId, qualified: body.qualified });
    return NextResponse.json({
      eventId: state.eventId,
      subEvent: state.subEvent,
      ownerClientId: state.ownerClientId ?? null,
      canEdit: state.ownerClientId === body.clientId,
      qualifiedByArtistId: state.qualifiedByArtistId,
      updatedAt: state.updatedAt,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 403 });
  }
}
