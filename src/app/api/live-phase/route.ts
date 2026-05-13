import { NextRequest, NextResponse } from "next/server";
import { getPhaseState, setPhase } from "@/lib/livePhase";

export async function GET() {
  const state = await getPhaseState();
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { votingCompleted?: boolean; scoringCompleted?: boolean; winnerVoter?: string };
    const state = await setPhase(body);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
