import { NextResponse } from "next/server";
import { getActiveEventId, getEventConfig, listEvents, setActiveEventId } from "@/lib/eventConfig";

export async function GET() {
  try {
    const activeId = await getActiveEventId();
    const config = await getEventConfig(activeId);
    const events = await listEvents();
    return NextResponse.json({ active: config, events }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not load event config", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { eventId?: string; subEvent?: string };

    if (body.eventId) {
      // Validate event exists
      await getEventConfig(body.eventId);
      await setActiveEventId(body.eventId);
    }

    if (body.subEvent) {
      const activeId = await getActiveEventId();
      const config = await getEventConfig(activeId);
      if (config.subEvents.includes(body.subEvent)) {
        config.activeSubEvent = body.subEvent;
        // Write back the updated config
        const { promises: fs } = await import("fs");
        const path = await import("path");
        const filePath = path.join(process.cwd(), "data", "events", `${activeId}.json`);
        await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
      }
    }

    const activeId = await getActiveEventId();
    const config = await getEventConfig(activeId);
    return NextResponse.json({ active: config }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not update event", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
