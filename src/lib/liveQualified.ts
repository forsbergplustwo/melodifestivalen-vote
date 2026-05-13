import { promises as fs } from "fs";
import path from "path";
import { getActiveEventId, getEventConfig } from "./eventConfig";

type QualifiedState = {
  ownerClientId?: string;
  qualifiedByArtistId: Record<string, boolean>;
  updatedAt: string;
};

const dataDir = path.join(process.cwd(), "data");

function statePath(eventId: string, subEvent: string) {
  return path.join(dataDir, `live-qualified-${eventId}-${subEvent}.json`);
}

async function readRaw(eventId: string, subEvent: string): Promise<QualifiedState> {
  const fp = statePath(eventId, subEvent);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(raw) as Partial<QualifiedState>;
    return {
      ownerClientId: parsed.ownerClientId,
      qualifiedByArtistId: parsed.qualifiedByArtistId ?? {},
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { qualifiedByArtistId: {}, updatedAt: new Date().toISOString() };
  }
}

async function writeRaw(eventId: string, subEvent: string, state: QualifiedState) {
  const fp = statePath(eventId, subEvent);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(state, null, 2), "utf8");
}

export async function getQualifiedState() {
  const eventId = await getActiveEventId();
  const config = await getEventConfig(eventId);
  const subEvent = config.activeSubEvent;
  return { eventId, subEvent, ...(await readRaw(eventId, subEvent)) };
}

export async function setQualified(input: { clientId: string; artistId: string; qualified: boolean }) {
  const eventId = await getActiveEventId();
  const config = await getEventConfig(eventId);
  const subEvent = config.activeSubEvent;
  const current = await readRaw(eventId, subEvent);

  if (!current.ownerClientId) {
    current.ownerClientId = input.clientId;
  }

  if (current.ownerClientId !== input.clientId) {
    throw new Error("Only the first controller can update qualification");
  }

  current.qualifiedByArtistId[input.artistId] = input.qualified;
  current.updatedAt = new Date().toISOString();
  await writeRaw(eventId, subEvent, current);
  return { eventId, subEvent, ...current };
}
