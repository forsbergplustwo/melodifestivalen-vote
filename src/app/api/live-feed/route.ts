import { NextResponse } from "next/server";
import { fetchLiveFeed, type LiveFeedResponse } from "@/lib/liveFeed";

let cachedData: LiveFeedResponse | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function GET() {
  try {
    const now = Date.now();
    if (cachedData && now - cachedAt < CACHE_TTL_MS) {
      return NextResponse.json(cachedData, { status: 200 });
    }
    const data = await fetchLiveFeed();
    cachedData = data;
    cachedAt = now;
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Live feed unavailable",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
