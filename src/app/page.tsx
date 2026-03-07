"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Artist = { id: string; name: string };
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
  voteCount: number;
  songAverage: number;
  showAverage: number;
  totalAverage: number;
};

type StateResponse = {
  artists: Artist[];
  votes: Vote[];
  leaderboard: LeaderboardRow[];
};

const defaultScores = { song: 7, show: 7 };

export default function Home() {
  const [voterName, setVoterName] = useState("");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [artistInput, setArtistInput] = useState("");
  const [activeTab, setActiveTab] = useState<"vote" | "board">("vote");
  const [loading, setLoading] = useState(true);
  const [savingVoteForArtistId, setSavingVoteForArtistId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [draftScoresByArtist, setDraftScoresByArtist] = useState<
    Record<string, { song: number; show: number }>
  >({});

  async function refreshState() {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not fetch state");
    }
    const nextState = (await response.json()) as StateResponse;
    setArtists(nextState.artists);
    setVotes(nextState.votes);
    setLeaderboard(nextState.leaderboard);
  }

  useEffect(() => {
    const savedVoterName = localStorage.getItem("mello-voter-name");
    if (savedVoterName) setVoterName(savedVoterName);

    refreshState()
      .catch(() => setErrorMessage("Could not load votes. Refresh and retry."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!voterName.trim()) return;
    localStorage.setItem("mello-voter-name", voterName.trim());
  }, [voterName]);

  const votesByCurrentUserAndArtist = useMemo(() => {
    const map = new Map<string, Vote>();
    votes
      .filter((vote) => vote.voter.toLowerCase() === voterName.trim().toLowerCase())
      .forEach((vote) => map.set(vote.artistId, vote));
    return map;
  }, [votes, voterName]);

  function getDraftScore(artistId: string) {
    const existingDraftScore = draftScoresByArtist[artistId];
    if (existingDraftScore) return existingDraftScore;

    const previousVote = votesByCurrentUserAndArtist.get(artistId);
    if (previousVote) {
      return { song: previousVote.song, show: previousVote.show };
    }

    return defaultScores;
  }

  function updateDraftScore(artistId: string, field: "song" | "show", value: number) {
    const currentScore = getDraftScore(artistId);
    setDraftScoresByArtist((previousScoreByArtist) => ({
      ...previousScoreByArtist,
      [artistId]: {
        ...currentScore,
        [field]: value,
      },
    }));
  }

  async function submitVote(artistId: string) {
    setErrorMessage("");

    if (!voterName.trim()) {
      setErrorMessage("Add your name first so we know whose vote this is.");
      return;
    }

    const score = getDraftScore(artistId);

    setSavingVoteForArtistId(artistId);
    const response = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voter: voterName.trim(),
        artistId,
        song: score.song,
        show: score.show,
      }),
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
  }

  async function addArtist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    if (!artistInput.trim()) return;

    const response = await fetch("/api/artists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: artistInput.trim() }),
    });

    if (!response.ok) {
      setErrorMessage("Could not add artist.");
      return;
    }

    const nextState = (await response.json()) as StateResponse;
    setArtists(nextState.artists);
    setVotes(nextState.votes);
    setLeaderboard(nextState.leaderboard);
    setArtistInput("");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-fuchsia-950 via-indigo-950 to-slate-950 text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <header className="mb-6 rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur">
          <p className="mb-2 inline-block rounded-full bg-yellow-300 px-3 py-1 text-xs font-bold tracking-wider text-black">
            MELODIFESTIVALEN PARTY MODE
          </p>
          <h1 className="text-3xl font-black uppercase tracking-wide md:text-5xl">Vote Like a Legend ✨</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/85 md:text-base">
            Rate each artist on <strong>Song</strong> and <strong>Show</strong>. Total is automatic.
            Everyone votes on their own phone. No login, just vibes.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <input
              value={voterName}
              onChange={(event) => setVoterName(event.target.value)}
              placeholder="Your name (e.g. Björn)"
              className="w-full rounded-xl border border-white/30 bg-black/25 px-4 py-2 text-white placeholder:text-white/50 focus:border-yellow-300 focus:outline-none"
            />
            <button
              onClick={() => setActiveTab("vote")}
              className={`rounded-xl px-4 py-2 font-semibold ${
                activeTab === "vote" ? "bg-yellow-300 text-black" : "bg-white/15 text-white"
              }`}
            >
              Vote
            </button>
            <button
              onClick={() => setActiveTab("board")}
              className={`rounded-xl px-4 py-2 font-semibold ${
                activeTab === "board" ? "bg-pink-300 text-black" : "bg-white/15 text-white"
              }`}
            >
              Leaderboard
            </button>
          </div>

          {errorMessage ? <p className="mt-3 text-sm text-rose-300">{errorMessage}</p> : null}
        </header>

        {loading ? (
          <div className="rounded-2xl border border-white/20 bg-white/10 p-8 text-center text-white/80">Loading party data…</div>
        ) : activeTab === "vote" ? (
          <section>
            <form onSubmit={addArtist} className="mb-5 flex flex-wrap gap-2">
              <input
                value={artistInput}
                onChange={(event) => setArtistInput(event.target.value)}
                placeholder="Add artist name"
                className="min-w-[220px] flex-1 rounded-xl border border-white/30 bg-black/25 px-4 py-2 text-white placeholder:text-white/50"
              />
              <button
                type="submit"
                className="rounded-xl bg-emerald-300 px-4 py-2 font-bold text-black transition hover:scale-[1.02]"
              >
                + Add Artist
              </button>
            </form>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {artists.map((artist) => {
                const score = getDraftScore(artist.id);
                const total = score.song + score.show;
                const hasVoted = votesByCurrentUserAndArtist.has(artist.id);

                return (
                  <article
                    key={artist.id}
                    className="rounded-2xl border border-white/25 bg-white/10 p-4 shadow-xl backdrop-blur"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-lg font-extrabold">{artist.name}</h2>
                      {hasVoted ? (
                        <span className="rounded-full bg-emerald-300 px-2 py-1 text-xs font-bold text-black">Voted</span>
                      ) : (
                        <span className="rounded-full bg-white/20 px-2 py-1 text-xs font-semibold text-white/80">Not voted</span>
                      )}
                    </div>

                    <label className="mb-2 block text-sm font-semibold">
                      Song: <span className="text-yellow-300">{score.song}</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={score.song}
                      onChange={(event) => updateDraftScore(artist.id, "song", Number(event.target.value))}
                      className="mb-3 w-full"
                    />

                    <label className="mb-2 block text-sm font-semibold">
                      Show: <span className="text-pink-300">{score.show}</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={score.show}
                      onChange={(event) => updateDraftScore(artist.id, "show", Number(event.target.value))}
                      className="mb-4 w-full"
                    />

                    <div className="mb-4 text-sm text-white/85">
                      Total: <span className="text-xl font-black text-cyan-300">{total}</span>
                    </div>

                    <button
                      onClick={() => submitVote(artist.id)}
                      disabled={savingVoteForArtistId === artist.id}
                      className="w-full rounded-xl bg-gradient-to-r from-yellow-300 to-pink-300 px-4 py-2 text-sm font-black text-black disabled:opacity-50"
                    >
                      {savingVoteForArtistId === artist.id ? "Saving…" : hasVoted ? "Update vote" : "Submit vote"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/25 bg-white/10 p-4 backdrop-blur md:p-6">
            <h2 className="mb-4 text-2xl font-black">Leaderboard 🏆</h2>
            <div className="space-y-3">
              {leaderboard.map((row, index) => (
                <div
                  key={row.artistId}
                  className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-xl bg-black/25 p-3"
                >
                  <div className="text-center text-xl font-black">{index + 1}</div>
                  <div>
                    <p className="text-lg font-bold">{row.artistName}</p>
                    <p className="text-xs text-white/70">{row.voteCount} votes</p>
                  </div>
                  <div className="text-right text-sm">
                    <p>
                      Song <strong>{row.songAverage.toFixed(1)}</strong>
                    </p>
                    <p>
                      Show <strong>{row.showAverage.toFixed(1)}</strong>
                    </p>
                    <p className="text-base font-black text-cyan-300">
                      Total {row.totalAverage.toFixed(1)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => refreshState().catch(() => setErrorMessage("Refresh failed"))}
              className="mt-5 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold"
            >
              Refresh live results
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
