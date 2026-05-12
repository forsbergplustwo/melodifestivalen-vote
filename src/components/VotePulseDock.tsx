"use client";

export type VotePulseItem =
  | {
      id: string;
      kind: "single";
      voter: string;
      artistName: string;
      total: number;
      reaction: string;
      chipHue: number;
    }
  | {
      id: string;
      kind: "burst";
      count: number;
      hint?: string;
    };

export function VotePulseDock({ items, active }: { items: VotePulseItem[]; active: boolean }) {
  if (!active || !items.length) return null;

  return (
    <div
      className="vote-pulse-dock pointer-events-none fixed right-0 z-[44] flex max-h-[38vh] max-w-[min(46vw,230px)] flex-col items-end justify-end gap-2 overflow-hidden pr-[max(0.5rem,env(safe-area-inset-right))]"
      style={{ top: "max(5.5rem, calc(env(safe-area-inset-top) + 4rem))" }}
      aria-live="polite"
    >
      {items.map((pulse) => (
        <div
          key={pulse.id}
          className="vote-pulse-card vote-pulse-toast w-full rounded-2xl border border-white/20 bg-black/80 px-3 py-2.5 text-right shadow-xl backdrop-blur-md"
        >
          {pulse.kind === "burst" ? (
            <p className="text-xs font-bold leading-snug text-white">
              <span className="text-cyan-200">+{pulse.count}</span> new votes
              {pulse.hint ? (
                <span className="mt-0.5 block font-semibold text-white/70">Latest · {pulse.hint}</span>
              ) : null}
            </p>
          ) : (
            <p className="text-xs font-semibold leading-snug text-white/95">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/40"
                  style={{ backgroundColor: `hsl(${pulse.chipHue} 72% 52%)` }}
                  aria-hidden
                />
                <strong className="text-white">{pulse.voter}</strong>
              </span>
              <span className="mt-1 block text-[11px] text-white/80">
                rated <strong className="text-cyan-200">{pulse.artistName}</strong>{" "}
                <strong className="text-amber-200">{pulse.total}/20</strong> {pulse.reaction}
              </span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
