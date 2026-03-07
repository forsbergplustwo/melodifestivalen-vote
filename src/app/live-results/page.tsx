"use client";

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
};

type ArtistState = { id: string; name: string; song?: string; imageUrl?: string };

type StateResponse = { artists: ArtistState[] };
type LiveHistoryResponse = { frames: LiveFeedResponse[] };

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function LiveResultsPage() {
  const [data, setData] = useState<LiveFeedResponse | null>(null);
  const [artists, setArtists] = useState<ArtistState[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState("Live Results");
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
      .then((d: any) => {
        if (d.active?.name) setEventName(`${d.active.country} ${d.active.name} Live Results`);
      })
      .catch(() => {});

    fetch("/api/state", { cache: "no-store" })
      .then((response) => response.json())
      .then((state: StateResponse) => setArtists(state.artists ?? []))
      .catch(() => {
        // no-op
      });

    refresh()
      .catch(() => setError("Could not load live results feed."))
      .finally(() => setLoading(false));

    const timer = setInterval(() => {
      refresh().catch(() => {
        // silent in live mode
      });
    }, 3000);

    return () => {
      clearInterval(timer);
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
      setLastChangedAtByArtistId((current) => ({ ...current, ...pointUpdates }));
    }
    if (Object.keys(rankUpdates).length) {
      setRankChangeByArtistId((current) => ({ ...current, ...rankUpdates }));
    }
  }, [displayedData]);

  const active = displayedData?.activeArtist ?? null;
  const activeLocal = active ? artistByNormalizedName.get(normalize(active.artist)) : undefined;
  const activePlace = active
    ? (displayedData?.standings.findIndex((item) => item.artistId === active.artistId) ?? -1) + 1
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-rose-950 to-black text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
        <header className="mb-4 rounded-2xl border border-red-300/30 bg-black/50 px-4 py-3 backdrop-blur">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button onClick={() => { window.location.href = "/"; }} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white">
              Voting
            </button>
            <button onClick={() => { window.location.href = "/"; }} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white">
              Leaderboard
            </button>
            <button className="rounded-xl bg-red-400 px-4 py-2 text-sm font-semibold text-black">
              Live results
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-black md:text-2xl">{eventName}</h1>
              <p className="text-xs text-white/60">
                {displayedData ? `Updated ${new Date(displayedData.fetchedAt).toLocaleTimeString()}` : "Auto-updating every 3s"}
                {replayIndex !== null ? " · Replay mode" : ""}
              </p>
              {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            </div>
            <div className="flex gap-2">
              <button onClick={() => startReplay().catch((e) => setError(e instanceof Error ? e.message : String(e)))} className="rounded-xl bg-yellow-300 px-5 py-2.5 text-sm font-black text-black shadow-lg">
                ▶ Replay Results
              </button>
              {replayIndex !== null ? (
                <button onClick={stopReplay} className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white">
                  Stop
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-lg font-bold text-white/70">Loading results…</p>
          </div>
        ) : null}

        {!loading && active ? (
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
          <h3 className="mb-3 text-lg font-black">Compact scoreboard</h3>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {displayedData?.standings?.map((row, index) => {
              const changedAt = lastChangedAtByArtistId[row.artistId];
              const justChanged = changedAt ? Date.now() - changedAt < 6500 : false;
              const rankChange = rankChangeByArtistId[row.artistId];
              const rankChangedRecently = rankChange ? Date.now() - rankChange.at < 6500 : false;

              return (
                <div key={row.artistId} className={`grid grid-cols-[72px_1fr_auto_auto] items-center gap-2 rounded-lg px-3 py-2 ${justChanged ? "bg-red-500/20 ring-1 ring-red-300/40" : "bg-white/10"}`}>
                  <div className={`text-center text-sm font-black ${rankChangedRecently ? (rankChange?.direction === "up" ? "rank-pop-up" : "rank-pop-down") : ""}`}>
                    #{index + 1}
                    {rankChangedRecently ? (
                      <span className={`ml-1 text-[10px] ${rankChange?.direction === "up" ? "text-emerald-300" : "text-rose-300"}`}>
                        {rankChange?.direction === "up" ? "▲" : "▼"}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold">{row.artist}</p>
                    <p className="truncate text-xs text-white/70">{row.song}</p>
                    {changedAt ? (
                      <p className={`text-[11px] ${justChanged ? "pulse-dot text-red-200" : "text-white/50"}`}>
                        Last changed {new Date(changedAt).toLocaleTimeString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right text-sm font-black text-yellow-300">+{row.delta}</div>
                  <div className="text-right text-lg font-black text-cyan-300">{row.points}</div>
                </div>
              );
            })}
          </div>
          <a href={displayedData?.source ?? "https://eurovisionworld.com"} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-cyan-200 underline">
            Source feed
          </a>
        </section>


      </div>
    </main>
  );
}
