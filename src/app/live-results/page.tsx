"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type LiveStanding = {
  artistId: string;
  artist: string;
  song: string;
  points: number;
  runningOrder: number;
  delta: number;
};

type LiveFeedResponse = {
  source: string;
  fetchedAt: string;
  activeArtist: LiveStanding | null;
  standings: LiveStanding[];
  usesPoints?: boolean;
};

type ArtistState = { id: string; name: string; song?: string; country?: string; flag?: string; imageUrl?: string };

type LiveHistoryResponse = { frames: LiveFeedResponse[] };
type EventResponse = { active?: { name?: string; country?: string; activeSubEvent?: string; artists?: ArtistState[] } | null };

type LiveQualifiedResponse = {
  ownerClientId: string | null;
  canEdit: boolean;
  qualifiedByArtistId: Record<string, boolean>;
};

type PhaseState = {
  votingCompleted: boolean;
  scoringCompleted: boolean;
  winnerVoter?: string;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function createClientId() {
  const generated = globalThis.crypto?.randomUUID?.();
  if (generated) return generated;
  return `live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getLiveClientId() {
  if (typeof window === "undefined") return "";
  const key = "mello-live-client-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = createClientId();
  localStorage.setItem(key, next);
  return next;
}

function isRoomCreator(): boolean {
  if (typeof window === "undefined") return false;
  const creator = localStorage.getItem("mello-room-creator") ?? "";
  const voter = localStorage.getItem("mello-voter-name") ?? "";
  if (creator && voter && creator.trim().toLowerCase() === voter.trim().toLowerCase()) return true;
  if (!creator && voter.trim()) return true;
  return false;
}

const officialEurovisionGradient = "radial-gradient(120% 150% at 90% -3%, #2200ff, #000c54 22.49%, #010a41 33.26%, #010a41 64.14%, #4c0a54 85.82%, #ff0178)";
const officialEurovisionLogo = "/eurovision-official-logo.svg";

export default function LiveResultsPage() {
  const [data, setData] = useState<LiveFeedResponse | null>(null);
  const [artists, setArtists] = useState<ArtistState[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState("Live Results");
  const [isSemiFinal, setIsSemiFinal] = useState(false);
  const [eventInfo, setEventInfo] = useState<{ country?: string; name?: string } | null>(null);
  const [qualifiedByArtistId, setQualifiedByArtistId] = useState<Record<string, boolean>>({});
  const [canEditQualified, setCanEditQualified] = useState(false);
  const [phase, setPhase] = useState<PhaseState>({ votingCompleted: false, scoringCompleted: false });
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [replayFrames, setReplayFrames] = useState<LiveFeedResponse[]>([]);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [lastChangedAtByArtistId, setLastChangedAtByArtistId] = useState<Record<string, number>>({});
  const [rankChangeByArtistId, setRankChangeByArtistId] = useState<Record<string, { direction: "up" | "down"; at: number }>>({});
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousPointsRef = useRef<Record<string, number>>({});
  const previousRankRef = useRef<Record<string, number>>({});

  async function refresh() {
    const response = await fetch("/api/live-feed", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Live feed unavailable");
    }
    const next = (await response.json()) as LiveFeedResponse;
    setData(next);

    const qualifiedResponse = await fetch(`/api/live-qualified?clientId=${encodeURIComponent(getLiveClientId())}`, { cache: "no-store" });
    if (qualifiedResponse.ok) {
      const qualifiedState = (await qualifiedResponse.json()) as LiveQualifiedResponse;
      setQualifiedByArtistId(qualifiedState.qualifiedByArtistId ?? {});
      setCanEditQualified(Boolean(qualifiedState.canEdit));
    }

    const phaseResponse = await fetch("/api/live-phase", { cache: "no-store" });
    if (phaseResponse.ok) {
      const nextPhase = (await phaseResponse.json()) as PhaseState;
      setPhase(nextPhase);
    }
  }

  function stopReplay() {
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    setReplayIndex(null);
  }

  async function startReplay() {
    stopReplay();

    const response = await fetch("/api/live-history", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Replay history unavailable");
    }

    const history = (await response.json()) as LiveHistoryResponse;
    const frames = history.frames ?? [];
    if (!frames.length) {
      throw new Error("No replay frames yet");
    }

    setReplayFrames(frames);
    setReplayIndex(0);

    replayTimerRef.current = setInterval(() => {
      setReplayIndex((current) => {
        if (current === null) return 0;
        const next = current + 1;
        if (next >= frames.length) {
          if (replayTimerRef.current) {
            clearInterval(replayTimerRef.current);
            replayTimerRef.current = null;
          }
          return null;
        }
        return next;
      });
    }, 3000);
  }

  useEffect(() => {
    fetch("/api/event", { cache: "no-store" })
      .then((r) => r.json())
      .then((response: EventResponse) => {
        if (response.active?.name) {
          setEventName(`${response.active.country} ${response.active.name} Live Results`);
          setEventInfo(response.active);
        }
        setIsSemiFinal(Boolean(response.active?.activeSubEvent && /semi/i.test(response.active.activeSubEvent)));
        if (response.active?.artists) {
          setArtists(response.active.artists ?? []);
        }
      })
      .catch(() => {});

    Promise.all([
      fetch("/api/live-feed", { cache: "no-store" }),
      fetch(`/api/live-qualified?clientId=${encodeURIComponent(getLiveClientId())}`, { cache: "no-store" }),
    ])
      .then(async ([feedResponse, qualifiedResponse]) => {
        if (!feedResponse.ok) throw new Error("Live feed unavailable");
        const nextFeed = (await feedResponse.json()) as LiveFeedResponse;
        setData(nextFeed);

        if (qualifiedResponse.ok) {
          const qualifiedState = (await qualifiedResponse.json()) as LiveQualifiedResponse;
          setQualifiedByArtistId(qualifiedState.qualifiedByArtistId ?? {});
          setCanEditQualified(Boolean(qualifiedState.canEdit));
        }

        const phaseResponse = await fetch("/api/live-phase", { cache: "no-store" });
        if (phaseResponse.ok) {
          const nextPhase = (await phaseResponse.json()) as PhaseState;
          setPhase(nextPhase);
        }
      })
      .catch(() => setError("Could not load live results feed."))
      .finally(() => setLoading(false));

    const timer = setInterval(() => {
      refresh().catch(() => {
        // silent in live mode
      });
    }, 3000);
    const clockTimer = setInterval(() => setNowTimestamp(Date.now()), 1000);

    return () => {
      clearInterval(timer);
      clearInterval(clockTimer);
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, []);

  const artistByNormalizedName = useMemo(() => {
    const map = new Map<string, ArtistState>();
    for (const artist of artists) {
      map.set(normalize(artist.name), artist);
    }
    return map;
  }, [artists]);

  const artistById = useMemo(() => {
    const map = new Map<string, ArtistState>();
    for (const artist of artists) {
      map.set(artist.id, artist);
    }
    return map;
  }, [artists]);

  const displayedData = replayIndex !== null && replayFrames[replayIndex] ? replayFrames[replayIndex] : data;

  useEffect(() => {
    if (!displayedData?.standings?.length) return;

    const now = Date.now();
    const previousPoints = previousPointsRef.current;
    const previousRanks = previousRankRef.current;
    const pointUpdates: Record<string, number> = {};
    const rankUpdates: Record<string, { direction: "up" | "down"; at: number }> = {};

    for (const [index, row] of displayedData.standings.entries()) {
      const currentRank = index + 1;

      const prevPoints = previousPoints[row.artistId];
      if (prevPoints !== undefined && row.points !== prevPoints) {
        pointUpdates[row.artistId] = now;
      }
      previousPoints[row.artistId] = row.points;

      const prevRank = previousRanks[row.artistId];
      if (prevRank !== undefined && prevRank !== currentRank) {
        rankUpdates[row.artistId] = {
          direction: currentRank < prevRank ? "up" : "down",
          at: now,
        };
      }
      previousRanks[row.artistId] = currentRank;
    }

    if (Object.keys(pointUpdates).length) {
      queueMicrotask(() => {
        setLastChangedAtByArtistId((current) => ({ ...current, ...pointUpdates }));
      });
    }
    if (Object.keys(rankUpdates).length) {
      queueMicrotask(() => {
        setRankChangeByArtistId((current) => ({ ...current, ...rankUpdates }));
      });
    }
  }, [displayedData]);

  async function toggleQualified(artistId: string) {
    const nextQualified = !qualifiedByArtistId[artistId];
    const response = await fetch("/api/live-qualified", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: getLiveClientId(), artistId, qualified: nextQualified }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Could not update qualification.");
      return;
    }

    const next = (await response.json()) as LiveQualifiedResponse;
    setQualifiedByArtistId(next.qualifiedByArtistId ?? {});
    setCanEditQualified(Boolean(next.canEdit));
  }

  const active = displayedData?.activeArtist ?? null;
  const activeLocal = active ? artistByNormalizedName.get(normalize(active.artist)) : undefined;
  const activePlace = active
    ? (displayedData?.standings.findIndex((item) => item.artistId === active.artistId) ?? -1) + 1
    : null;

  return (
    <main
      className="min-h-screen text-white"
      style={{
        backgroundImage: officialEurovisionGradient,
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:px-8 md:py-10 md:pb-10">
        <div className="z-40 mb-2 flex items-center justify-between gap-2">
          <div className="w-fit rounded-full border border-fuchsia-300/30 bg-black/55 px-3 py-1 shadow-lg backdrop-blur">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={officialEurovisionLogo} alt="Eurovision Song Contest official logo" className="h-5 w-auto object-contain" />
          </div>
        </div>

        <header className="mb-3 rounded-xl border border-white/15 bg-black/35 p-3 shadow-xl backdrop-blur">
          <p className="mb-1 hidden rounded-full bg-yellow-300 px-2 py-0.5 text-xs font-bold tracking-wider text-black sm:inline-block">
            {eventInfo ? `${eventInfo.country} ${eventInfo.name?.toUpperCase() ?? ""}` : "LOADING EVENT..."}
          </p>
          <h1 className="text-lg font-black uppercase tracking-wide sm:text-xl md:text-3xl">{eventName}</h1>
          <p className="mt-2 hidden max-w-3xl text-sm text-white/85 md:block md:text-base">
            {isSemiFinal ? "Semi-final mode — no live points yet. Toggle qualifiers manually." : "Live results with real-time points from EurovisionWorld."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-xs text-white/60">
              {displayedData ? `Updated ${new Date(displayedData.fetchedAt).toLocaleTimeString()}` : "Auto-updating every 3s"}
              {replayIndex !== null ? " · Replay mode" : ""}
            </p>
            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            {isRoomCreator() ? (
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => {
                    void fetch("/api/live-phase", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ votingCompleted: !phase.votingCompleted }),
                    }).then((r) => r.json()).then((next) => setPhase(next as PhaseState));
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${phase.votingCompleted ? "bg-emerald-500 text-white" : "bg-white/15 text-white"}`}
                >
                  {phase.votingCompleted ? "✓ Voting done" : "Mark voting done"}
                </button>
                <button
                  onClick={() => {
                    void fetch("/api/live-phase", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ scoringCompleted: !phase.scoringCompleted }),
                    }).then((r) => r.json()).then((next) => setPhase(next as PhaseState));
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${phase.scoringCompleted ? "bg-yellow-400 text-black" : "bg-white/15 text-white"}`}
                >
                  {phase.scoringCompleted ? "✓ Scoring done" : "Mark scoring done"}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-lg font-bold text-white/70">Loading results…</p>
          </div>
        ) : null}

        {!loading && !isSemiFinal && active ? (
          <section className="mb-5 overflow-hidden rounded-2xl border border-red-400/40 bg-black/45 shadow-2xl">
            <div className="grid items-stretch md:grid-cols-[220px_1fr]">
              <div className="h-52 bg-black/40 md:h-full">
                {activeLocal?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeLocal.imageUrl} alt={active.artist} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex h-full items-center justify-center text-6xl">🎤</div>
                )}
              </div>
              <div className="p-5">
                <p className="text-xs uppercase tracking-widest text-red-200">Receiving points now</p>
                <h2 className="text-3xl font-black md:text-4xl">{active.artist}</h2>
                <p className="text-base text-red-100/90">♪ {active.song}</p>
                <div className="mt-4 flex items-end gap-5">
                  <div>
                    <p className="text-xs text-white/70">Current points</p>
                    <p className="text-5xl font-black text-red-300">{active.points}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/70">Latest gain</p>
                    <p className="text-3xl font-black text-yellow-300">+{active.delta}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/70">Current place</p>
                    <p className="text-4xl font-black text-white">#{activePlace ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/70">Running order</p>
                    <p className="text-3xl font-black">#{active.runningOrder}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/20 bg-black/45 p-3 md:p-4">
          <h3 className="mb-3 text-lg font-black">{isSemiFinal ? "Qualification board" : "Compact scoreboard"}</h3>
          <div className="grid gap-1.5 md:grid-cols-2">
            {displayedData?.standings?.map((row, index) => {
              const changedAt = lastChangedAtByArtistId[row.artistId];
              const justChanged = changedAt ? nowTimestamp - changedAt < 6500 : false;
              const rankChange = rankChangeByArtistId[row.artistId];
              const rankChangedRecently = rankChange ? nowTimestamp - rankChange.at < 6500 : false;
              const artist = artistById.get(row.artistId);

              return (
                <div key={row.artistId} className={`grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 ${justChanged ? "bg-red-500/20 ring-1 ring-red-300/40" : "bg-white/5"}`}>
                  <span className={`text-sm font-black tabular-nums ${rankChangedRecently ? (rankChange?.direction === "up" ? "text-emerald-300" : "text-rose-300") : "text-white/60"}`}>
                    {index + 1}.
                    {rankChangedRecently ? (
                      <span className="ml-0.5 text-xs">{rankChange?.direction === "up" ? "▲" : "▼"}</span>
                    ) : null}
                  </span>
                  <span className="truncate text-sm font-bold text-white">
                    {artist?.country || row.artist}{artist?.flag ? ` ${artist.flag}` : ""} <span className="text-xs font-semibold text-white/50">#{row.runningOrder}</span>
                  </span>
                  {isSemiFinal ? (
                    <button
                      type="button"
                      onClick={() => { void toggleQualified(row.artistId); }}
                      disabled={!canEditQualified}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${qualifiedByArtistId[row.artistId] ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60"} ${!canEditQualified ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      {qualifiedByArtistId[row.artistId] ? "Qualified" : "Not qualified"}
                    </button>
                  ) : (
                    <span className="text-sm font-black tabular-nums text-yellow-300">+{row.delta}</span>
                  )}
                  <span className="text-sm font-black tabular-nums text-cyan-300">{row.points}</span>
                </div>
              );
            })}
          </div>
          <a href={displayedData?.source ?? "https://eurovisionworld.com"} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs from-fuchsia-300 underline">
            Source feed
          </a>
        </section>

        {isRoomCreator() ? (
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-black/45 p-2 backdrop-blur-md md:hidden" aria-label="Footer navigation">
            <div className="mx-auto grid w-full grid-cols-3 gap-2">
              <Link href="/" className="rounded-xl bg-white/10 px-2 py-2 text-center text-xs font-bold text-white/85 transition hover:bg-white/20 sm:px-3 sm:text-sm">
                Voting
              </Link>
              <Link href="/" className="rounded-xl bg-white/10 px-2 py-2 text-center text-xs font-bold text-white/85 transition hover:bg-white/20 sm:px-3 sm:text-sm">
                <span className="sm:hidden">Results</span>
                <span className="hidden sm:inline">Results</span>
              </Link>
              <button className="rounded-xl border border-white/35 bg-white/20 px-2 py-2 text-center text-xs font-bold text-white sm:px-3 sm:text-sm">
                <span className="sm:hidden">Admin</span>
                <span className="hidden sm:inline">Admin</span>
              </button>
            </div>
          </nav>
        ) : (
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-black/45 p-2 backdrop-blur-md md:hidden" aria-label="Footer navigation">
            <div className="mx-auto grid w-full grid-cols-2 gap-2">
              <Link href="/" className="rounded-xl bg-white/10 px-2 py-2 text-center text-xs font-bold text-white/85 transition hover:bg-white/20 sm:px-3 sm:text-sm">
                Voting
              </Link>
              <Link href="/" className="rounded-xl bg-white/10 px-2 py-2 text-center text-xs font-bold text-white/85 transition hover:bg-white/20 sm:px-3 sm:text-sm">
                <span className="sm:hidden">Results</span>
                <span className="hidden sm:inline">Results</span>
              </Link>
            </div>
          </nav>
        )}
      </div>
    </main>
  );
}
