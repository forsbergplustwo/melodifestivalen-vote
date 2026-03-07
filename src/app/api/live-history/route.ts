import { NextResponse } from "next/server";
import { readLiveHistory } from "@/lib/liveFeed";

export async function GET() {
  try {
    const frames = await readLiveHistory();
    return NextResponse.json({ frames }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not read live history", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
