import { promises as fs } from "fs";
import path from "path";
import { getActiveEventId, getEventConfig } from "./eventConfig";

type PhaseState = {
  votingCompleted: boolean;
  scoringCompleted: boolean;
  winnerVoter?: string;
  updatedAt: string;
};

const dataDir = path.join(process.cwd(), "data");

function statePath(eventId: string, subEvent: string) {
  return path.join(dataDir, `live-phase-${eventId}-${subEvent}.json`);
}

async function readRaw(eventId: string, subEvent: string): Promise<PhaseState> {
  const fp = statePath(eventId, subEvent);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(raw) as Partial<PhaseState>;
    return {
      votingCompleted: parsed.votingCompleted ?? false,
      scoringCompleted: parsed.scoringCompleted ?? false,
      winnerVoter: parsed.winnerVoter,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { votingCompleted: false, scoringCompleted: false, updatedAt: new Date().toISOString() };
  }
}

async function writeRaw(eventId: string, subEvent: string, state: PhaseState) {
  const fp = statePath(eventId, subEvent);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(state, null, 2), "utf8");
}

export async function getPhaseState() {
  const eventId = await getActiveEventId();
  const config = await getEventConfig(eventId);
  const subEvent = config.activeSubEvent;
  return { eventId, subEvent, ...(await readRaw(eventId, subEvent)) };
}

export async function setPhase(input: { votingCompleted?: boolean; scoringCompleted?: boolean; winnerVoter?: string }) {
  const eventId = await getActiveEventId();
  const config = await getEventConfig(eventId);
  const subEvent = config.activeSubEvent;
  const current = await readRaw(eventId, subEvent);

  if (input.votingCompleted !== undefined) current.votingCompleted = input.votingCompleted;
  if (input.scoringCompleted !== undefined) current.scoringCompleted = input.scoringCompleted;
  if (input.winnerVoter !== undefined) current.winnerVoter = input.winnerVoter;
  current.updatedAt = new Date().toISOString();

  await writeRaw(eventId, subEvent, current);
  return { eventId, subEvent, ...current };
}
