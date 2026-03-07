import { promises as fs } from "fs";
import path from "path";

export type EventArtist = {
  id: string;
  name: string;
  song?: string;
  country?: string;
  flag?: string;
  runningOrder?: number;
  imageUrl?: string;
};

export type LiveSourceConfig = {
  url: string;
  tableIds: string[];
};

export type EventConfig = {
  id: string;
  name: string;
  country: string;
  type: "national" | "eurovision";
  subEvents: string[];
  activeSubEvent: string;
  liveSource: LiveSourceConfig;
  artists: EventArtist[];
};

const dataDir = path.join(process.cwd(), "data");
const eventsDir = path.join(dataDir, "events");
const activeEventPath = path.join(dataDir, "active-event.json");

export async function getActiveEventId(): Promise<string> {
  try {
    const raw = await fs.readFile(activeEventPath, "utf8");
    const parsed = JSON.parse(raw) as { eventId: string };
    return parsed.eventId;
  } catch {
    return "melodifestivalen-2026";
  }
}

export async function setActiveEventId(eventId: string): Promise<void> {
  await fs.writeFile(activeEventPath, JSON.stringify({ eventId }, null, 2), "utf8");
}

export async function getEventConfig(eventId?: string): Promise<EventConfig> {
  const id = eventId ?? (await getActiveEventId());
  const filePath = path.join(eventsDir, `${id}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as EventConfig;
}

export async function listEvents(): Promise<{ id: string; name: string; country: string }[]> {
  const files = await fs.readdir(eventsDir);
  const events: { id: string; name: string; country: string }[] = [];

  for (const file of files) {
    if (file.startsWith("_") || !file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(eventsDir, file), "utf8");
      const config = JSON.parse(raw) as EventConfig;
      events.push({ id: config.id, name: config.name, country: config.country });
    } catch {
      // skip malformed
    }
  }

  return events;
}

export function eventStateFileName(eventId: string, subEvent?: string): string {
  return subEvent ? `state-${eventId}-${subEvent}.json` : `state-${eventId}.json`;
}

export function eventHistoryFileName(eventId: string, subEvent?: string): string {
  return subEvent ? `live-history-${eventId}-${subEvent}.json` : `live-history-${eventId}.json`;
}
