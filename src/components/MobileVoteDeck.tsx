"use client";

import { MouseEvent, useEffect, useRef, useState } from "react";
import { Slider } from "@/components/slider";

export type DeckArtist = { id: string; name: string; song?: string; imageUrl?: string; country?: string };

type Props = {
  artists: DeckArtist[];
  getDraftScore: (artistId: string) => { song: number; show: number };
  updateDraftScore: (artistId: string, field: "song" | "show", value: number) => void;
  hasVotedFor: (artistId: string) => boolean;
  savingVoteForArtistId: string | null;
  submitVote: (artistId: string, event?: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
};

export function MobileVoteDeck({
  artists,
  getDraftScore,
  updateDraftScore,
  hasVotedFor,
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
  const footerNavHeightPx = 72;
  const fixedCardHeightPx = Math.max(300, initialViewportHeight - swipeNavHeightPx - footerNavHeightPx);
  const cardHeight = `${fixedCardHeightPx}px`;

  return (
    <div className="md:hidden">
      <div className="vote-deck-anchor sticky top-[calc(env(safe-area-inset-top)+2px)] z-30 mb-2 flex shrink-0 snap-start flex-col gap-1.5 rounded-xl border border-white/15 bg-black/65 px-3 py-1.5 pt-1 backdrop-blur">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-violet-400 to-blue-400 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <p className="text-xs font-black tracking-wide text-fuchsia-100">
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
          <p className="text-right text-[10px] font-semibold uppercase tracking-wider text-fuchsia-100">Semi 1</p>
        </div>
      </div>

      <div className="space-y-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {artists.map((artist, index) => {
          const score = getDraftScore(artist.id);
          const sum = score.song + score.show;
          const hasVoted = hasVotedFor(artist.id);
          const songPulse = sliderPulse?.artistId === artist.id && sliderPulse.field === "song";
          const showPulse = sliderPulse?.artistId === artist.id && sliderPulse.field === "show";

          return (
            <div
              key={artist.id}
              ref={(element) => {
                cardRefs.current[index] = element;
              }}
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

              <div className="absolute left-3 top-3">
                <span className="rounded-full bg-black/65 px-3 py-1.5 text-sm font-black text-white backdrop-blur-sm">#{index + 1}</span>
              </div>
              <div className="absolute right-3 top-3">
                {hasVoted ? (
                  <span className="rounded-full bg-emerald-400/90 px-3 py-1.5 text-sm font-black text-black">Voted</span>
                ) : (
                  <span className="rounded-full bg-black/55 px-3 py-1.5 text-sm font-semibold text-white/85 backdrop-blur-sm">Not voted</span>
                )}
              </div>

              <div className="relative flex min-h-[inherit] flex-col justify-end p-4 pt-[42%]">
                <div className="pointer-events-auto">
                  <h2 className="flex items-center gap-2 text-2xl font-black leading-tight drop-shadow-md">
                    <span>{artist.name}</span>
                    {artist.country ? (
                      <span className="rounded-full bg-black/65 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-fuchsia-100 backdrop-blur-sm">
                        {artist.country}
                      </span>
                    ) : null}
                  </h2>
                  {artist.song ? <p className="mt-1 text-sm font-semibold text-cyan-200 drop-shadow">♪ {artist.song}</p> : null}

                  <div className={`mt-4 grid grid-cols-[58px_30px_1fr] items-center gap-2 transition-transform duration-200 ease-out ${songPulse ? "vote-slider-nudge" : ""}`}>
                    <p className="text-base font-semibold text-white/90">Song</p>
                    <p className="text-base font-black text-fuchsia-200">{score.song}</p>
                    <Slider
                      size="large"
                      value={score.song}
                      min={1}
                      max={10}
                      onChange={(value) => updateDraftScore(artist.id, "song", value)}
                      onValueCommit={() => setSliderPulse({ artistId: artist.id, field: "song" })}
                      className="mb-0"
                    />
                  </div>
                  <div className={`mt-2.5 grid grid-cols-[58px_30px_1fr] items-center gap-2 transition-transform duration-200 ease-out ${showPulse ? "vote-slider-nudge" : ""}`}>
                    <p className="text-base font-semibold text-white/90">Show</p>
                    <p className="text-base font-black text-amber-300">{score.show}</p>
                    <Slider
                      size="large"
                      value={score.show}
                      min={1}
                      max={10}
                      onChange={(value) => updateDraftScore(artist.id, "show", value)}
                      onValueCommit={() => setSliderPulse({ artistId: artist.id, field: "show" })}
                      className="mb-0"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={(event) => void submitVote(artist.id, event)}
                    disabled={savingVoteForArtistId === artist.id}
                    className="vote-deck-cta mt-2.5 mb-1 min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 px-4 py-3.5 text-base font-black text-white shadow-lg shadow-fuchsia-900/35 active:scale-[0.98] disabled:opacity-50"
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

