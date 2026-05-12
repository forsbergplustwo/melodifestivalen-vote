"use client";

import { MouseEvent, useEffect, useRef, useState } from "react";
import { Slider } from "@/components/slider";

export type DeckArtist = { id: string; name: string; song?: string; imageUrl?: string; country?: string };

type Props = {
  artists: DeckArtist[];
  getDraftScore: (artistId: string) => { song: number; show: number };
  updateDraftScore: (artistId: string, field: "song" | "show", value: number) => void;
  getSortedVotesForArtist: (artistId: string) => { voter: string; song: number; show: number; total: number }[];
  savingVoteForArtistId: string | null;
  submitVote: (artistId: string, event?: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
};

export function MobileVoteDeck({
  artists,
  getDraftScore,
  updateDraftScore,
  getSortedVotesForArtist,
  savingVoteForArtistId,
  submitVote,
}: Props) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sliderPulse, setSliderPulse] = useState<{ artistId: string; field: "song" | "show" } | null>(null);
  const [initialViewportHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));

  useEffect(() => {
    if (!artists.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { index: number; ratio: number } | null = null;
        for (const entry of entries) {
          const index = cardRefs.current.indexOf(entry.target as HTMLDivElement);
          if (index < 0) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { index, ratio: entry.intersectionRatio };
          }
        }
        if (best && best.ratio >= 0.5) {
          setActiveIndex(best.index);
        }
      },
      { root: null, threshold: [0.4, 0.55, 0.7, 0.85] }
    );

    cardRefs.current.forEach((card) => {
      if (card) observer.observe(card);
    });

    return () => observer.disconnect();
  }, [artists]);

  useEffect(() => {
    if (!sliderPulse) return;
    const timer = window.setTimeout(() => setSliderPulse(null), 320);
    return () => window.clearTimeout(timer);
  }, [sliderPulse]);

  useEffect(() => {
    document.documentElement.classList.add("mobile-vote-page-snap");
    return () => {
      document.documentElement.classList.remove("mobile-vote-page-snap");
    };
  }, []);

  function scrollToIndex(index: number) {
    cardRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!artists.length) return null;

  const total = artists.length;
  const showIndex = Math.min(activeIndex + 1, total);
  const progressPct = Math.max(0, Math.min(100, (showIndex / total) * 100));
  const swipeNavHeightPx = 60;
  const footerNavHeightPx = 62;
  const fixedCardHeightPx = Math.max(300, initialViewportHeight - swipeNavHeightPx - footerNavHeightPx + 18);
  const cardHeight = `${fixedCardHeightPx}px`;

  return (
    <div className="md:hidden">
      <div className="vote-deck-anchor sticky top-[calc(env(safe-area-inset-top)+4px)] z-30 mb-2 flex shrink-0 snap-start flex-col gap-1.5 rounded-xl border border-white/15 bg-black/65 px-3 py-1.5 pt-1 backdrop-blur">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-violet-400 to-blue-400 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <p className="text-sm font-black tracking-wide text-fuchsia-100">
            {showIndex} / {total}
          </p>
          <div className="flex justify-center overflow-x-auto py-0.5" role="tablist" aria-label="Jump to act">
            <div className="flex gap-1.5">
              {artists.map((artist, index) => (
                <button
                  key={artist.id}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  onClick={() => scrollToIndex(index)}
                  className={`h-2.5 min-w-2.5 shrink-0 rounded-full transition-all ${
                    index === activeIndex ? "w-7 bg-fuchsia-300" : "bg-white/25 hover:bg-white/45"
                  }`}
                  aria-label={`Go to ${artist.name}`}
                />
              ))}
            </div>
          </div>
          <p className="text-right text-xs font-semibold uppercase tracking-wider text-fuchsia-100">Semi 1</p>
        </div>
      </div>

      <div className="space-y-12 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {artists.map((artist, index) => {
          const score = getDraftScore(artist.id);
          const sum = score.song + score.show;
          const rankedVotes = getSortedVotesForArtist(artist.id);
          const songPulse = sliderPulse?.artistId === artist.id && sliderPulse.field === "song";
          const showPulse = sliderPulse?.artistId === artist.id && sliderPulse.field === "show";

          return (
            <div
              key={artist.id}
              ref={(element) => {
                cardRefs.current[index] = element;
              }}
              data-artist-card-id={artist.id}
              className="vote-deck-card relative flex-none snap-start snap-always overflow-hidden rounded-2xl border border-white/20 shadow-2xl"
              style={{ minHeight: cardHeight, height: cardHeight, maxHeight: cardHeight }}
            >
              <div className="absolute inset-0 bg-slate-950">
                {artist.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={artist.imageUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: "center 22%" }} referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex h-full items-center justify-center text-7xl opacity-40">🎤</div>
                )}
              </div>

              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-50% to-black"
                aria-hidden
              />

              <div className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between">
                <span className="rounded-full bg-black/65 px-3 py-1.5 text-base font-black text-white backdrop-blur-sm">
                  #{index + 1}{artist.country ? ` · ${artist.country}` : ""}
                </span>
                {rankedVotes.length ? (
                  <div className="w-auto max-w-[min(72vw,260px)] overflow-hidden rounded-lg border border-white/20 bg-black/65 backdrop-blur-sm">
                    <div className="grid grid-cols-[minmax(0,1fr)_2.35rem_2.35rem_2.35rem] gap-1 border-b border-white/15 bg-black/35 px-2 py-1 text-xs font-bold uppercase tracking-wider text-white/70">
                      <span>Voter</span>
                      <span className="text-right">Song</span>
                      <span className="text-right">Show</span>
                      <span className="text-right">Pts</span>
                    </div>
                    <div className="divide-y divide-white/10">
                      {rankedVotes.slice(0, 5).map((vote) => (
                        <div key={`${artist.id}-${vote.voter}`} className="grid grid-cols-[minmax(0,1fr)_2.35rem_2.35rem_2.35rem] items-center gap-1 px-2 py-1 text-sm">
                          <span className="font-semibold text-white/90">{vote.voter.length > 10 ? `${vote.voter.slice(0, 10)}…` : vote.voter}</span>
                          <span className="text-right font-semibold tabular-nums text-white/80">{vote.song}</span>
                          <span className="text-right font-semibold tabular-nums text-white/80">{vote.show}</span>
                          <span className="text-right font-black tabular-nums text-white">{vote.total}</span>
                        </div>
                      ))}
                    </div>
                    {rankedVotes.length > 5 ? (
                      <div className="border-t border-white/10 px-2 py-1 text-right text-xs font-semibold text-white/70">
                        +{rankedVotes.length - 5} more
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="relative flex min-h-[inherit] flex-col justify-end p-3 pt-[42%]">
                <div className="pointer-events-auto">
                  <h2 className="flex items-center gap-2 text-2xl font-black leading-tight drop-shadow-md">
                    <span>{artist.name}</span>
                  </h2>
                  {artist.song ? <p className="mt-1 text-sm font-semibold from-fuchsia-300 drop-shadow">♪ {artist.song}</p> : null}

                  <div className={`mt-4 grid grid-cols-[58px_30px_1fr] items-center gap-x-2 gap-y-0 transition-transform duration-200 ease-out ${songPulse ? "vote-slider-nudge" : ""}`}>
                    <p className="self-center text-xl leading-none font-semibold text-white/90">Song</p>
                    <p className="self-center text-xl leading-none font-black text-fuchsia-200">{score.song}</p>
                    <Slider
                      size="large"
                      value={score.song}
                      min={0}
                      max={12}
                      onChange={(value) => updateDraftScore(artist.id, "song", value)}
                      onValueCommit={() => setSliderPulse({ artistId: artist.id, field: "song" })}
                      className="mb-0"
                    />
                  </div>
                  <div className={`mt-6 grid grid-cols-[58px_30px_1fr] items-center gap-x-2 gap-y-0 transition-transform duration-200 ease-out ${showPulse ? "vote-slider-nudge" : ""}`}>
                    <p className="self-center text-xl leading-none font-semibold text-white/90">Show</p>
                    <p className="self-center text-xl leading-none font-black text-amber-300">{score.show}</p>
                    <Slider
                      size="large"
                      value={score.show}
                      min={0}
                      max={12}
                      onChange={(value) => updateDraftScore(artist.id, "show", value)}
                      onValueCommit={() => setSliderPulse({ artistId: artist.id, field: "show" })}
                      className="mb-0"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={(event) => void submitVote(artist.id, event)}
                    disabled={savingVoteForArtistId === artist.id}
                    className="vote-deck-cta mt-6 mb-1 min-h-[44px] w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 px-4 py-2.5 text-xl font-black text-white shadow-lg shadow-fuchsia-900/35 active:scale-[0.98] disabled:opacity-50"
                  >
                    {savingVoteForArtistId === artist.id ? "Saving…" : `Submit ${sum} points to ${artist.country ?? artist.name}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

