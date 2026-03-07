"use client";

import { MouseEvent, useEffect, useMemo, useState } from "react";

type Artist = { id: string; name: string; song?: string; imageUrl?: string };
type Vote = {
  id: string;
  voter: string;
  artistId: string;
  song: number;
  show: number;
  total: number;
};
type LeaderboardRow = {
  artistId: string;
  artistName: string;
  songTitle?: string;
  imageUrl?: string;
  voteCount: number;
  songAverage: number;
  showAverage: number;
  totalAverage: number;
};

type EventInfo = {
  id: string;
  name: string;
  country: string;
  type: string;
};

type StateResponse = {
  artists: Artist[];
  votes: Vote[];
  leaderboard: LeaderboardRow[];
};

type VoteEffect = {
  id: string;
  artistId: string;
  artistName: string;
  total: number;
  mood: "good" | "ok" | "bad";
  emoji: string;
  x: number;
  y: number;
};

const defaultScores = { song: 7, show: 7 };
const artistEmojiBySlot = ["💫", "🔥", "🦄", "🎸", "🕺", "👑", "🚀", "🌟", "💥", "🎤", "⚡", "🌈"];
const refreshToastVersion = "mello-refresh-toast-v1";
const scrollPositionKey = "mello-scroll-y";

export default function Home() {
  const [voterName, setVoterName] = useState("");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [activeTab, setActiveTab] = useState<"vote" | "board">("vote");
  const [loading, setLoading] = useState(true);
  const [savingVoteForArtistId, setSavingVoteForArtistId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showReveal, setShowReveal] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const [revealCountdown, setRevealCountdown] = useState<number | null>(null);
  const [joinedName, setJoinedName] = useState("");
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [voteEffect, setVoteEffect] = useState<VoteEffect | null>(null);
  const [showRefreshToast, setShowRefreshToast] = useState(false);

  const [appVersion, setAppVersion] = useState<string | null>(null);

  const [draftScoresByArtist, setDraftScoresByArtist] = useState<Record<string, { song: number; show: number }>>({});

  async function refreshState() {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not fetch state");
    const nextState = (await response.json()) as StateResponse;
    setArtists(nextState.artists);
    setVotes(nextState.votes);
    setLeaderboard(nextState.leaderboard);
  }

  useEffect(() => {
    const savedVoterName = localStorage.getItem("mello-voter-name");
    if (savedVoterName) {
      setVoterName(savedVoterName);
      setJoinedName(savedVoterName);
    }

    const savedScrollY = localStorage.getItem(scrollPositionKey);
    if (savedScrollY) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: Number(savedScrollY), behavior: "auto" });
      });
      localStorage.removeItem(scrollPositionKey);
    }

    const seenRefreshToast = localStorage.getItem(refreshToastVersion) === "done";
    if (!seenRefreshToast) setShowRefreshToast(true);

    fetch("/api/event", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: any) => setEventInfo(d.active ?? null))
      .catch(() => {});

    refreshState()
      .catch(() => setErrorMessage("Could not load votes. Refresh and retry."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!voterName.trim()) return;
    localStorage.setItem("mello-voter-name", voterName.trim());
  }, [voterName]);

  useEffect(() => {
    const refreshTimer = setInterval(() => {
      refreshState().catch(() => {
        // keep silent for background refreshes
      });
    }, 5000);

    return () => clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchVersion() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { version?: string };
        if (!data.version || cancelled) return;

        setAppVersion((currentVersion) => {
          if (!currentVersion) return data.version!;
          if (currentVersion !== data.version) {
            localStorage.setItem(scrollPositionKey, String(window.scrollY));
            window.location.reload();
          }
          return currentVersion;
        });
      } catch {
        // silent in event mode
      }
    }

    fetchVersion();
    const versionTimer = setInterval(fetchVersion, 12000);

    return () => {
      cancelled = true;
      clearInterval(versionTimer);
    };
  }, []);

  useEffect(() => {
    if (!voteEffect) return;
    const effectTimer = setTimeout(() => setVoteEffect(null), 3000);
    return () => clearTimeout(effectTimer);
  }, [voteEffect]);

  const votesByCurrentUserAndArtist = useMemo(() => {
    const map = new Map<string, Vote>();
    votes
      .filter((vote) => vote.voter.toLowerCase() === voterName.trim().toLowerCase())
      .forEach((vote) => map.set(vote.artistId, vote));
    return map;
  }, [votes, voterName]);

  const voteStatsByArtist = useMemo(() => {
    const stats = new Map<string, { lowest?: Vote; highest?: Vote }>();

    for (const artist of artists) {
      const artistVotes = votes.filter((vote) => vote.artistId === artist.id);
      if (!artistVotes.length) {
        stats.set(artist.id, {});
        continue;
      }

      const sortedByTotal = [...artistVotes].sort((left, right) => left.total - right.total);
      stats.set(artist.id, {
        lowest: sortedByTotal[0],
        highest: sortedByTotal[sortedByTotal.length - 1],
      });
    }

    return stats;
  }, [artists, votes]);

  function getDraftScore(artistId: string) {
    const existingDraftScore = draftScoresByArtist[artistId];
    if (existingDraftScore) return existingDraftScore;
    const previousVote = votesByCurrentUserAndArtist.get(artistId);
    if (previousVote) return { song: previousVote.song, show: previousVote.show };
    return defaultScores;
  }

  function updateDraftScore(artistId: string, field: "song" | "show", value: number) {
    const currentScore = getDraftScore(artistId);
    setDraftScoresByArtist((previous) => ({ ...previous, [artistId]: { ...currentScore, [field]: value } }));
  }

  function buildVoteEffect(artistId: string, total: number, x: number, y: number): VoteEffect {
    const artistIndex = artists.findIndex((artist) => artist.id === artistId);
    const emoji = artistEmojiBySlot[(artistIndex >= 0 ? artistIndex : 0) % artistEmojiBySlot.length];
    const artistName = artists.find((artist) => artist.id === artistId)?.name ?? "Artist";
    const mood = total >= 18 ? "good" : total < 14 ? "bad" : "ok";

    return {
      id: crypto.randomUUID(),
      artistId,
      artistName,
      total,
      mood,
      emoji,
      x,
      y,
    };
  }

  async function submitVote(artistId: string, clickEvent?: MouseEvent<HTMLButtonElement>) {
    setErrorMessage("");
    if (!voterName.trim()) {
      setErrorMessage("Add your name first so we know whose vote this is.");
      return;
    }

    const score = getDraftScore(artistId);
    const total = score.song + score.show;
    const buttonRect = clickEvent?.currentTarget.getBoundingClientRect();
    const effectX = buttonRect ? buttonRect.left + buttonRect.width / 2 : window.innerWidth / 2;
    const effectY = buttonRect ? buttonRect.top + buttonRect.height / 2 : window.innerHeight * 0.7;
    setSavingVoteForArtistId(artistId);
    const response = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voter: voterName.trim(), artistId, song: score.song, show: score.show }),
    });
    setSavingVoteForArtistId(null);

    if (!response.ok) {
      setErrorMessage("Vote failed. Try again.");
      return;
    }

    const nextState = (await response.json()) as StateResponse;
    setArtists(nextState.artists);
    setVotes(nextState.votes);
    setLeaderboard(nextState.leaderboard);
    setVoteEffect(buildVoteEffect(artistId, total, effectX, effectY));
  }

  const topThree = leaderboard.slice(0, 3);
  const everyoneHasVoted = artists.length > 0 && artists.every((artist) => votesByCurrentUserAndArtist.has(artist.id));

  function startRevealMode() {
    setShowReveal(true);
    setRevealStep(0);
    setRevealCountdown(3);

    setTimeout(() => setRevealCountdown(2), 350);
    setTimeout(() => setRevealCountdown(1), 700);
    setTimeout(() => {
      setRevealCountdown(null);
      setRevealStep(1);
    }, 1050);
    setTimeout(() => setRevealStep(2), 1450);
    setTimeout(() => setRevealStep(3), 1850);
  }

  function revealNext() {
    setRevealStep((current) => Math.min(3, current + 1));
  }

  function resetReveal() {
    setShowReveal(false);
    setRevealStep(0);
    setRevealCountdown(null);
  }

  function joinParty() {
    const name = voterName.trim();
    if (!name) {
      setErrorMessage("Type your name, then press Join.");
      return;
    }
    setErrorMessage("");
    setJoinedName(name);
    localStorage.setItem("mello-voter-name", name);
    setActiveTab("vote");
  }

  function refreshToLatestVersion() {
    localStorage.setItem(refreshToastVersion, "done");
    setShowRefreshToast(false);
    localStorage.setItem(scrollPositionKey, String(window.scrollY));
    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-fuchsia-950 via-indigo-950 to-slate-950 text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="sticky top-1 z-40 mb-2 w-fit rounded-full border border-white/20 bg-black/55 px-3 py-1 text-xs font-black tracking-wide text-yellow-200 shadow-lg backdrop-blur">
          ✨ Mello Vote
        </div>

        <header className="mb-2 rounded-xl border border-white/15 bg-black/35 p-2.5 shadow-xl backdrop-blur">
          <p className="mb-1 hidden rounded-full bg-yellow-300 px-2 py-0.5 text-[10px] font-bold tracking-wider text-black sm:inline-block">
            {eventInfo ? `${eventInfo.country} ${eventInfo.name.toUpperCase()}` : "LOADING EVENT..."}
          </p>
          <h1 className="text-lg font-black uppercase tracking-wide sm:text-xl md:text-3xl">Vote Like a Legend ✨</h1>
          <p className="mt-2 hidden max-w-3xl text-sm text-white/85 md:block md:text-base">
            Running order is prefilled for tonight. Rate each act on <strong>Song</strong> and <strong>Show</strong>.
            Total is automatic. No login, only glory.
          </p>

          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
            {!joinedName ? (
              <>
                <input
                  value={voterName}
                  onChange={(event) => setVoterName(event.target.value)}
                  placeholder="Your name (e.g. Björn)"
                  className="w-full rounded-xl border border-white/30 bg-black/25 px-4 py-2 text-white placeholder:text-white/50 focus:border-yellow-300 focus:outline-none"
                />
                <button onClick={joinParty} className="rounded-xl bg-cyan-300 px-4 py-2 font-black text-black">
                  Join
                </button>
              </>
            ) : (
              <p className="flex items-center rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 md:col-span-2">
                Joined as <strong className="ml-1">{joinedName}</strong>
              </p>
            )}
            <button
              onClick={() => setActiveTab("vote")}
              className={`rounded-xl px-4 py-2 font-semibold ${activeTab === "vote" ? "bg-yellow-300 text-black" : "bg-white/15 text-white"}`}
            >
              Voting
            </button>
            <button
              onClick={() => setActiveTab("board")}
              className={`rounded-xl px-4 py-2 font-semibold ${activeTab === "board" ? "bg-pink-300 text-black" : "bg-white/15 text-white"}`}
            >
              Leaderboard
            </button>
            <button
              onClick={() => {
                window.location.href = "/live-results";
              }}
              className="rounded-xl bg-white/15 px-4 py-2 font-semibold text-white"
            >
              Live results
            </button>
          </div>
          <p className="mt-2 text-xs text-white/60">Live sync every 5s across all phones.</p>
          {errorMessage ? <p className="mt-2 text-sm text-rose-300">{errorMessage}</p> : null}
        </header>

        {showRefreshToast ? (
          <div className="fixed bottom-3 left-1/2 z-[60] w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-cyan-200/40 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white">
                New version available. <span className="font-bold text-cyan-200">Refresh to get latest version.</span>
              </p>
              <button onClick={refreshToLatestVersion} className="ml-auto rounded-lg bg-cyan-300 px-3 py-1.5 text-xs font-black text-black">
                Refresh now
              </button>
            </div>
          </div>
        ) : null}

        {voteEffect ? (
          <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            <div
              className={`confetti-origin ${voteEffect.mood === "good" ? "confetti-origin--good" : voteEffect.mood === "bad" ? "confetti-origin--bad" : "confetti-origin--ok"}`}
              style={{ left: voteEffect.x, top: voteEffect.y }}
            >
              {Array.from({ length: 26 }).map((_, index) => (
                <span
                  key={`${voteEffect.id}-${index}`}
                  className="confetti-particle"
                  style={{
                    ["--dx" as string]: `${(Math.random() - 0.5) * 420}px`,
                    ["--dy" as string]: `${-140 - Math.random() * 300}px`,
                    ["--rot" as string]: `${Math.random() * 700 - 350}deg`,
                    ["--delay" as string]: `${Math.random() * 260}ms`,
                  }}
                >
                  {voteEffect.mood === "good"
                    ? `${voteEffect.emoji}🪩🔥👑`
                    : voteEffect.mood === "bad"
                      ? `${voteEffect.emoji}🗑️💀🤡`
                      : `${voteEffect.emoji}😏🍿🫖`}
                </span>
              ))}
            </div>

            <div className="mx-auto mt-6 w-fit rounded-2xl border border-white/30 bg-black/70 px-4 py-3 text-center text-sm font-bold text-white shadow-2xl">
              {voteEffect.artistName}: <span className="text-cyan-300">{voteEffect.total}/20</span>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-white/20 bg-white/10 p-8 text-center text-white/80">Loading party data…</div>
        ) : activeTab === "vote" ? (
          <section>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {artists.map((artist, index) => {
                const score = getDraftScore(artist.id);
                const total = score.song + score.show;
                const hasVoted = votesByCurrentUserAndArtist.has(artist.id);

                return (
                  <article key={artist.id} className="overflow-hidden rounded-2xl border border-white/25 bg-white/10 shadow-xl backdrop-blur">
                    <div className="relative h-44 w-full bg-black/30">
                      {artist.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={artist.imageUrl} alt={artist.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-5xl">🎤</div>
                      )}
                      <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-bold">#{index + 1}</div>
                    </div>

                    <div className="p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h2 className="text-lg font-extrabold">{artist.name}</h2>
                        {hasVoted ? (
                          <span className="rounded-full bg-emerald-300 px-2 py-1 text-xs font-bold text-black">Voted</span>
                        ) : (
                          <span className="rounded-full bg-white/20 px-2 py-1 text-xs font-semibold text-white/80">Not voted</span>
                        )}
                      </div>

                      {artist.song ? <p className="mb-3 text-sm text-cyan-200">♪ {artist.song}</p> : null}

                      <label className="mb-2 block text-sm font-semibold">Song: <span className="text-yellow-300">{score.song}</span></label>
                      <input type="range" min={1} max={10} value={score.song} onChange={(event) => updateDraftScore(artist.id, "song", Number(event.target.value))} className="mb-3 w-full" />

                      <label className="mb-2 block text-sm font-semibold">Show: <span className="text-pink-300">{score.show}</span></label>
                      <input type="range" min={1} max={10} value={score.show} onChange={(event) => updateDraftScore(artist.id, "show", Number(event.target.value))} className="mb-4 w-full" />

                      <div className="mb-4 text-sm text-white/85">Total: <span className="text-xl font-black text-cyan-300">{total}</span></div>

                      <button
                        onClick={(event) => submitVote(artist.id, event)}
                        disabled={savingVoteForArtistId === artist.id}
                        className="w-full rounded-xl bg-gradient-to-r from-yellow-300 to-pink-300 px-4 py-2 text-sm font-black text-black disabled:opacity-50"
                      >
                        {savingVoteForArtistId === artist.id ? "Saving…" : hasVoted ? "Update vote" : "Submit vote"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setActiveTab("board")}
                className={`rounded-2xl px-6 py-3 text-sm font-black transition ${
                  everyoneHasVoted
                    ? "bg-emerald-300 text-black hover:scale-[1.02]"
                    : "bg-white/15 text-white"
                }`}
              >
                {everyoneHasVoted ? "See results 🏆" : "Leaderboard"}
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/25 bg-white/10 p-4 backdrop-blur md:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2 md:sticky md:top-14 md:z-30 md:rounded-lg md:bg-slate-950/80 md:px-2 md:py-1.5 md:backdrop-blur">
              <h2 className="mr-auto text-2xl font-black">Leaderboard 🏆</h2>
              {!showReveal ? (
                <button onClick={startRevealMode} className="rounded-xl bg-yellow-300 px-3 py-2 text-sm font-black text-black">
                  Reveal our winners 🎉
                </button>
              ) : (
                <>
                  {revealStep < 3 ? (
                    <button onClick={revealNext} className="rounded-xl bg-pink-300 px-3 py-2 text-sm font-black text-black">
                      Reveal next
                    </button>
                  ) : null}
                  <button onClick={resetReveal} className="rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold text-white">
                    Exit reveal
                  </button>
                </>
              )}
            </div>

            {showReveal ? (
              <div className="mb-4 rounded-xl border border-yellow-300/40 bg-black/30 p-4">
                <p className="mb-2 text-xs uppercase tracking-widest text-yellow-200">Our Winners Reveal</p>

                {revealCountdown !== null ? (
                  <div className="mb-3 rounded-lg border border-fuchsia-300/40 bg-gradient-to-r from-fuchsia-500/35 via-indigo-500/30 to-cyan-500/35 p-5 text-center shadow-[0_0_30px_rgba(236,72,153,0.35)]">
                    <p className="text-xs uppercase tracking-[0.35em] text-white/80">Get ready</p>
                    <p className="text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.7)]">{revealCountdown}</p>
                  </div>
                ) : null}

                {topThree.slice(0, revealStep).map((row, index) => {
                  const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
                  const artist = artists.find((item) => item.id === row.artistId);

                  return (
                    <div
                      key={row.artistId}
                      className={`mb-3 overflow-hidden rounded-xl border p-0 last:mb-0 ${
                        index === 0
                          ? "border-yellow-300/60 bg-gradient-to-r from-yellow-500/20 to-fuchsia-500/20"
                          : index === 1
                            ? "border-slate-300/50 bg-gradient-to-r from-slate-300/15 to-cyan-500/15"
                            : "border-amber-700/60 bg-gradient-to-r from-amber-700/20 to-rose-500/15"
                      }`}
                    >
                      <div className="grid grid-cols-[88px_1fr_auto] items-center gap-3 p-3">
                        <div className="h-20 w-20 overflow-hidden rounded-lg bg-black/30">
                          {artist?.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={artist.imageUrl} alt={row.artistName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-3xl">🎤</div>
                          )}
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-widest text-white/70">#{index + 1} place</p>
                          <p className="text-xl font-black">{medal} {row.artistName}</p>
                          {row.songTitle ? <p className="text-sm text-cyan-200">♪ {row.songTitle}</p> : null}
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-white/70">Total</p>
                          <p className="text-2xl font-black text-cyan-300">{row.totalAverage.toFixed(1)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
              {leaderboard.map((row, index) => {
                const yourVote = votesByCurrentUserAndArtist.get(row.artistId);
                const stats = voteStatsByArtist.get(row.artistId);

                return (
                  <div key={row.artistId} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-xl bg-black/25 p-3">
                    <div className="text-center text-xl font-black">{index + 1}</div>
                    <div>
                      <p className="text-xl font-bold">{row.artistName}</p>
                      {row.songTitle ? <p className="text-sm text-cyan-200">♪ {row.songTitle}</p> : null}
                      <p className="text-base text-white/80">{row.voteCount} votes</p>
                      <p className="mt-1 text-base text-white/95">
                        You: <strong>{yourVote ? `${yourVote.total}/20` : "—"}</strong> · Avg: <strong>{row.totalAverage.toFixed(1)}</strong>
                      </p>
                      <p className="text-base text-rose-200/95">
                        Lowest: <strong>{stats?.lowest ? `${stats.lowest.voter} (${stats.lowest.total})` : "—"}</strong>
                      </p>
                      <p className="text-base text-emerald-200/95">
                        Highest: <strong>{stats?.highest ? `${stats.highest.voter} (${stats.highest.total})` : "—"}</strong>
                      </p>
                    </div>
                    <div className="text-right text-base">
                      <p>Song <strong>{row.songAverage.toFixed(1)}</strong></p>
                      <p>Show <strong>{row.showAverage.toFixed(1)}</strong></p>
                      <p className="text-lg font-black text-cyan-300">Total {row.totalAverage.toFixed(1)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => refreshState().catch(() => setErrorMessage("Refresh failed"))} className="mt-5 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold">
              Refresh live results
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
