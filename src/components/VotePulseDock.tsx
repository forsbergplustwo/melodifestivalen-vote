"use client";

export type VotePulseItem =
  | {
      id: string;
      kind: "single";
      voter: string;
      artistId: string;
      artistName: string;
      total: number;
      reaction: string;
      chipHue: number;
    }
  | {
      id: string;
      kind: "reaction";
      voter: string;
      artistId: string;
      artistName: string;
      emoji: string;
    }
  | {
      id: string;
      kind: "burst";
      count: number;
      hint?: string;
    };

export function VotePulseDock({
  items,
  active,
  onSelectArtist,
}: {
  items: VotePulseItem[];
  active: boolean;
  onSelectArtist?: (artistId: string) => void;
}) {
  if (!active || !items.length) return null;

  return (
    <div className="vote-pulse-dock pointer-events-none fixed left-7 top-[6.5rem] z-[44] flex max-h-[38vh] flex-col items-start justify-start gap-2 overflow-y-auto pr-2" aria-live="polite">
      {items.map((pulse) => (
        <div
          key={pulse.id}
          className="vote-pulse-card vote-pulse-toast pointer-events-auto w-auto rounded-2xl border border-white/20 bg-black/65 px-2.5 py-2 text-left shadow-xl backdrop-blur-sm"
        >
          {pulse.kind === "burst" ? (
            <p className="text-base font-semibold leading-snug text-white">
              <span>+{pulse.count}</span> new votes
              {pulse.hint ? (
                <span className="mt-0.5 block text-white/75">Latest · {pulse.hint}</span>
              ) : null}
            </p>
          ) : pulse.kind === "reaction" ? (
            <p className="flex items-center gap-2 text-left text-base font-semibold leading-snug text-white">
              <span aria-hidden className="text-3xl leading-none">{`${pulse.emoji}${pulse.emoji}${pulse.emoji}`}</span>
              <span>{pulse.voter}</span>
            </p>
          ) : (
            <p className="grid grid-cols-[auto_1fr] items-center gap-2 text-left text-base font-semibold leading-snug text-white">
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <span aria-hidden className="text-3xl leading-none">{pulse.reaction}</span>
                <span>{pulse.voter}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-white/90">
                <span>rated</span>
                <button
                  type="button"
                  onClick={() => onSelectArtist?.(pulse.artistId)}
                  className="align-middle text-white underline decoration-white/40 underline-offset-2"
                >
                  {pulse.artistName}
                </button>
                <span>{pulse.total}/24</span>
              </span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
