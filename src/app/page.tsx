"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileVoteDeck } from "@/components/MobileVoteDeck";
import { Slider } from "@/components/slider";
import { VotePulseDock, type VotePulseItem } from "@/components/VotePulseDock";
import { normalizeEurovisionPoints } from "@/lib/eurovisionPoints";

type Artist = { id: string; name: string; song?: string; imageUrl?: string; country?: string; flag?: string; runningOrder?: number };
type Vote = {
  id: string;
  voter: string;
  artistId: string;
  song: number;
  show: number;
  total: number;
  createdAt?: string;
  updatedAt?: string;
};
type LeaderboardRow = {
  artistId: string;
  artistName: string;
  country?: string;
  flag?: string;
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

type PresenceEvent = {
  id: string;
  voter: string;
  joinedAt: string;
};

type Participant = {
  voter: string;
  lastSeenAt: string;
};

type ReactionEvent = {
  id: string;
  voter: string;
  artistId: string;
  emoji: string;
  exact?: boolean;
  createdAt: string;
  updatedAt?: string;
};

type StateResponse = {
  artists: Artist[];
  votes: Vote[];
  leaderboard: LeaderboardRow[];
  creator?: string;
  presenceEvents?: PresenceEvent[];
  participants?: Participant[];
  reactionEvents?: ReactionEvent[];
};

type EventResponse = {
  active?: EventInfo | null;
};

const defaultScores = { song: 0, show: 0 };
const refreshToastVersion = "mello-refresh-toast-v1";
const scrollPositionKey = "mello-scroll-y";
const voteScrollPositionKey = "mello-vote-scroll-y";
const roomCodeStorageKey = "mello-room-code";
const activeTabStorageKey = "mello-active-tab";
const officialEurovisionGradient = "radial-gradient(120% 150% at 90% -3%, #2200ff, #000c54 22.49%, #010a41 33.26%, #010a41 64.14%, #4c0a54 85.82%, #ff0178)";
const officialEurovisionLogo = "/eurovision-official-logo.svg";
const showVotePulseDock = true;
const showJoinToasts = true;

type RoomApiResponse = {
  roomCode?: string;
  error?: string;
};

const roomCodePattern = /^[A-Z2-9]{6}$/;

function createClientId() {
  const generated = globalThis.crypto?.randomUUID?.();
  if (generated) return generated;
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getRoomCodeFromUrl(): string {
  if (typeof window === "undefined") return "";
  const roomParam = new URLSearchParams(window.location.search).get("room");
  const normalized = roomParam?.trim().toUpperCase() ?? "";
  return roomCodePattern.test(normalized) ? normalized : "";
}

function setRoomCodeInUrl(roomCode: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  window.history.replaceState({}, "", url.toString());
}

function getSharePartyUrl(roomCode: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  return url.toString();
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "absolute";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textArea);
    return copied;
  } catch {
    return false;
  }
}

export default function Home() {
  const [voterName, setVoterName] = useState("");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [presenceEvents, setPresenceEvents] = useState<PresenceEvent[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeTab, setActiveTab] = useState<"vote" | "board">("vote");
  const [loading, setLoading] = useState(false);
  const [savingVoteForArtistId, setSavingVoteForArtistId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [joinedName, setJoinedName] = useState("");
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [qualifiedByArtistId, setQualifiedByArtistId] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<{ votingCompleted: boolean; scoringCompleted: boolean; winnerVoter?: string }>({ votingCompleted: false, scoringCompleted: false });
  const [showRefreshToast, setShowRefreshToast] = useState(true);
  const [votePulseItems, setVotePulseItems] = useState<VotePulseItem[]>([]);
  const [activeRoomCode, setActiveRoomCode] = useState("");
  const [roomCreator, setRoomCreator] = useState("");
  const [joinToastItems, setJoinToastItems] = useState<{ id: string; voter: string }[]>([]);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomActionLoading, setRoomActionLoading] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [shareCopyFeedback, setShareCopyFeedback] = useState("");
  const [showJoinedNotice, setShowJoinedNotice] = useState(false);
  const [openEmojiPickerArtistId, setOpenEmojiPickerArtistId] = useState<string | null>(null);
  const [selectedPersonalVoter, setSelectedPersonalVoter] = useState("");
  const roomDeepLinkHandledRef = useRef(false);

  const [draftScoresByArtist, setDraftScoresByArtist] = useState<Record<string, { song: number; show: number }>>({});
  const voteSnapshotRef = useRef<Map<string, string>>(new Map());
  const presenceSnapshotRef = useRef<Map<string, string>>(new Map());
  const reactionSnapshotRef = useRef<Map<string, string>>(new Map());
  const voteSnapshotInitializedRef = useRef(false);
  const presenceSnapshotInitializedRef = useRef(false);
  const reactionSnapshotInitializedRef = useRef(false);
  const pulseTimersRef = useRef<number[]>([]);
  const appVersionRef = useRef<string | null>(null);
  const currentVoterNameRef = useRef("");
  const presenceAnnouncedKeyRef = useRef("");

  function hueFromName(name: string) {
    let hue = 0;
    for (let index = 0; index < name.length; index++) {
      hue = (hue + name.charCodeAt(index) * (index + 11)) % 360;
    }
    return hue;
  }

  function reactionFromTotal(total: number) {
    if (total >= 18) return "🔥";
    if (total <= 10) return "😬";
    return "✨";
  }

  function getToastReactionEmoji(inputEmoji: string) {
    const variants: Record<string, string[]> = {
      "😳": ["😳", "😬", "🤮", "😵"],
      "👎": ["👎", "🙅", "🚫", "😒"],
      "😂": ["😂", "🤣", "💀", "🫠"],
      "👏": ["👏", "🙌", "🔥", "✨"],
      "👍": ["👍", "👌", "✅", "💪"],
      "🤩": ["🤩", "😍", "🌟", "🚀"],
    };

    const pool = variants[inputEmoji] ?? [inputEmoji || "✨"];
    return pool[Math.floor(Math.random() * pool.length)] ?? inputEmoji;
  }

  const queueVotePulses = useCallback((changedVotes: Vote[], nextArtists: Artist[]) => {
    const artistNameById = new Map(nextArtists.map((artist) => [artist.id, artist.name]));
    if (!changedVotes.length) return;

    const singlePulseFromVote = (vote: Vote): VotePulseItem => ({
      id: createClientId(),
      kind: "single",
      voter: vote.voter,
      artistId: vote.artistId,
      artistName: artistNameById.get(vote.artistId) ?? "Artist",
      total: vote.total,
      reaction: reactionFromTotal(vote.total),
      chipHue: hueFromName(vote.voter),
    });

    const batch =
      changedVotes.length > 3
        ? [
            {
              id: createClientId(),
              kind: "burst" as const,
              count: changedVotes.length - 1,
              hint: `${changedVotes[0].voter} · ${(artistNameById.get(changedVotes[0].artistId) ?? "Artist")} ${changedVotes[0].total}/24`,
            },
            singlePulseFromVote(changedVotes[0]),
          ]
        : changedVotes.map(singlePulseFromVote);

    setVotePulseItems((current) => [...batch, ...current]);

    batch.forEach((item) => {
      const timer = window.setTimeout(() => {
        setVotePulseItems((current) => current.filter((pulse) => pulse.id !== item.id));
      }, 10000);
      pulseTimersRef.current.push(timer);
    });
  }, []);

  const processIncomingVotes = useCallback((nextVotes: Vote[], nextArtists: Artist[]) => {
    const previousSnapshot = voteSnapshotRef.current;
    const nextSnapshot = new Map<string, string>();
    const changedVotes: Vote[] = [];

    for (const vote of nextVotes) {
      const stamp = vote.updatedAt ?? vote.createdAt ?? vote.id;
      nextSnapshot.set(vote.id, stamp);
      if (previousSnapshot.size && previousSnapshot.get(vote.id) !== stamp) {
        changedVotes.push(vote);
      }
    }

    if (!voteSnapshotInitializedRef.current) {
      voteSnapshotRef.current = nextSnapshot;
      voteSnapshotInitializedRef.current = true;
      return;
    }

    voteSnapshotRef.current = nextSnapshot;

    if (!changedVotes.length) return;

    changedVotes.sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? "0");
      const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? "0");
      return rightTime - leftTime;
    });

    queueVotePulses(changedVotes, nextArtists);
  }, [queueVotePulses]);

  const processIncomingPresenceEvents = useCallback((nextEvents: PresenceEvent[]) => {
    const previousSnapshot = presenceSnapshotRef.current;
    const nextSnapshot = new Map<string, string>();
    const newEvents: PresenceEvent[] = [];

    for (const event of nextEvents) {
      const stamp = event.joinedAt ?? event.id;
      nextSnapshot.set(event.id, stamp);
      if (previousSnapshot.size && previousSnapshot.get(event.id) !== stamp) {
        newEvents.push(event);
      }
    }

    if (!presenceSnapshotInitializedRef.current) {
      presenceSnapshotRef.current = nextSnapshot;
      presenceSnapshotInitializedRef.current = true;
      return;
    }

    presenceSnapshotRef.current = nextSnapshot;
    if (!newEvents.length) return;

    newEvents.sort((left, right) => Date.parse(right.joinedAt ?? "0") - Date.parse(left.joinedAt ?? "0"));

    const visibleEvents = newEvents.filter((event) => event.voter.trim().toLowerCase() !== currentVoterNameRef.current);
    if (!visibleEvents.length) return;

    const items = visibleEvents.slice(0, 3).map((event) => ({ id: createClientId(), voter: event.voter }));
    setJoinToastItems((current) => [...items, ...current].slice(0, 5));

    items.forEach((item) => {
      const timer = window.setTimeout(() => {
        setJoinToastItems((current) => current.filter((toast) => toast.id !== item.id));
      }, 8000);
      pulseTimersRef.current.push(timer);
    });
  }, []);

  const processIncomingReactionEvents = useCallback((nextEvents: ReactionEvent[], nextArtists: Artist[]) => {
    const previousSnapshot = reactionSnapshotRef.current;
    const nextSnapshot = new Map<string, string>();
    const newEvents: ReactionEvent[] = [];

    for (const event of nextEvents) {
      const stamp = event.updatedAt ?? event.createdAt ?? event.id;
      nextSnapshot.set(event.id, stamp);
      if (previousSnapshot.size && previousSnapshot.get(event.id) !== stamp) {
        newEvents.push(event);
      }
    }

    if (!reactionSnapshotInitializedRef.current) {
      reactionSnapshotRef.current = nextSnapshot;
      reactionSnapshotInitializedRef.current = true;
      return;
    }

    reactionSnapshotRef.current = nextSnapshot;
    if (!newEvents.length) return;

    const artistNameById = new Map(nextArtists.map((artist) => [artist.id, artist.name]));

    newEvents
      .sort((left, right) => Date.parse(right.updatedAt ?? right.createdAt ?? "0") - Date.parse(left.updatedAt ?? left.createdAt ?? "0"))
      .slice(0, 4)
      .forEach((event) => {
        const item: VotePulseItem = {
          id: createClientId(),
          kind: "reaction",
          voter: event.voter,
          artistId: event.artistId,
          artistName: artistNameById.get(event.artistId) ?? "Artist",
          emoji: event.exact ? event.emoji : getToastReactionEmoji(event.emoji),
        };

        setVotePulseItems((current) => [item, ...current]);
        const timer = window.setTimeout(() => {
          setVotePulseItems((current) => current.filter((pulse) => pulse.id !== item.id));
        }, 10000);
        pulseTimersRef.current.push(timer);
      });
  }, []);

  const applyState = useCallback((nextState: StateResponse) => {
    setArtists(nextState.artists);
    setVotes(nextState.votes);
    setLeaderboard(nextState.leaderboard);
    setPresenceEvents(nextState.presenceEvents ?? []);
    setParticipants(nextState.participants ?? []);
    if (nextState.creator) setRoomCreator(nextState.creator);
    processIncomingVotes(nextState.votes, nextState.artists);
    processIncomingPresenceEvents(nextState.presenceEvents ?? []);
    processIncomingReactionEvents(nextState.reactionEvents ?? [], nextState.artists);
  }, [processIncomingPresenceEvents, processIncomingReactionEvents, processIncomingVotes]);

  const loadRoomState = useCallback(async (roomCode: string) => {
    const response = await fetch(`/api/state?room=${encodeURIComponent(roomCode)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not fetch state");
    const nextState = (await response.json()) as StateResponse;
    applyState(nextState);
  }, [applyState]);

  const refreshState = useCallback(async () => {
    if (!activeRoomCode) return;
    await loadRoomState(activeRoomCode);
  }, [activeRoomCode, loadRoomState]);

  useEffect(() => {
    currentVoterNameRef.current = voterName.trim().toLowerCase();
  }, [voterName]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedRoom = localStorage.getItem(roomCodeStorageKey) ?? "";
    const savedName = localStorage.getItem("mello-voter-name") ?? "";
    const savedTab = localStorage.getItem(activeTabStorageKey);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate client-only persisted UI state after mount
    setVoterName(savedName);
    setSelectedPersonalVoter(savedName);
    if (savedTab === "vote" || savedTab === "board") {
      setActiveTab(savedTab);
    }
    setActiveRoomCode(savedRoom);
    setLoading(Boolean(savedRoom));
    setJoinedName(savedName && savedRoom ? savedName : "");
    setShowRefreshToast(localStorage.getItem(refreshToastVersion) !== "done");

    const deepLinkedRoom = getRoomCodeFromUrl();
    setRoomCodeInput(deepLinkedRoom || savedRoom);
  }, []);

  useEffect(() => {
    const name = joinedName.trim();
    const room = activeRoomCode.trim().toUpperCase();
    if (!name || !room) return;

    const presenceKey = `${room}::${name.toLowerCase()}`;
    if (presenceAnnouncedKeyRef.current === presenceKey) return;
    presenceAnnouncedKeyRef.current = presenceKey;

    fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, voter: name }),
    }).catch(() => {
      // best-effort broadcast only
    });
  }, [activeRoomCode, applyState, joinedName]);

  useEffect(() => {
    if (roomDeepLinkHandledRef.current) return;
    const deepLinkedRoomCode = getRoomCodeFromUrl();
    roomDeepLinkHandledRef.current = true;
    if (!deepLinkedRoomCode || deepLinkedRoomCode === activeRoomCode) return;

    queueMicrotask(() => {
      setRoomActionLoading(true);
      setLoading(true);
      fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", room: deepLinkedRoomCode }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(response.status === 404 ? "Party not found." : "Could not join party.");
          return response.json() as Promise<RoomApiResponse>;
        })
        .then((payload) => {
          if (!payload.roomCode) throw new Error("Could not join party.");
          setActiveRoomCode(payload.roomCode);
          localStorage.setItem(roomCodeStorageKey, payload.roomCode);
        })
        .catch((error) => {
          setErrorMessage(error instanceof Error ? error.message : "Could not join party.");
        })
        .finally(() => {
          setRoomActionLoading(false);
          setLoading(false);
        });
    });
  }, [activeRoomCode]);

  useEffect(() => {
    const savedScrollY = localStorage.getItem(scrollPositionKey);
    if (savedScrollY) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: Number(savedScrollY), behavior: "auto" });
      });
      localStorage.removeItem(scrollPositionKey);
    }

    fetch("/api/event", { cache: "no-store" })
      .then((r) => r.json())
      .then((response: EventResponse) => setEventInfo(response.active ?? null))
      .catch(() => {});

    if (!activeRoomCode) return;

    fetch(`/api/state?room=${encodeURIComponent(activeRoomCode)}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not fetch state");
        return response.json() as Promise<StateResponse>;
      })
      .then((nextState) => applyState(nextState))
      .catch(() => setErrorMessage("Could not load party votes. Refresh and retry."))
      .finally(() => setLoading(false));
  }, [activeRoomCode, applyState]);

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
  }, [refreshState]);

  useEffect(() => {
    let cancelled = false;

    async function fetchVersion() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { version?: string };
        if (!data.version || cancelled) return;

        const currentVersion = appVersionRef.current;
        if (!currentVersion) {
          appVersionRef.current = data.version;
          return;
        }

        if (currentVersion !== data.version) {
          appVersionRef.current = data.version;
          localStorage.setItem(scrollPositionKey, String(window.scrollY));
          window.location.reload();
        }
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
    async function refreshQualified() {
      const response = await fetch("/api/live-qualified", { cache: "no-store" });
      if (response.ok) {
        const next = (await response.json()) as { qualifiedByArtistId?: Record<string, boolean> };
        setQualifiedByArtistId(next.qualifiedByArtistId ?? {});
      }
    }
    refreshQualified();
    const qualifiedTimer = setInterval(refreshQualified, 5000);

    async function refreshPhase() {
      const response = await fetch("/api/live-phase", { cache: "no-store" });
      if (response.ok) {
        const next = (await response.json()) as { votingCompleted?: boolean; scoringCompleted?: boolean; winnerVoter?: string };
        setPhase({
          votingCompleted: next.votingCompleted ?? false,
          scoringCompleted: next.scoringCompleted ?? false,
          winnerVoter: next.winnerVoter,
        });
      }
    }
    refreshPhase();
    const phaseTimer = setInterval(refreshPhase, 5000);

    return () => {
      clearInterval(qualifiedTimer);
      clearInterval(phaseTimer);
    };
  }, []);

  useEffect(() => {
    if (!showJoinedNotice) return;
    const timer = window.setTimeout(() => setShowJoinedNotice(false), 3200);
    return () => window.clearTimeout(timer);
  }, [showJoinedNotice]);

  useEffect(() => {
    return () => {
      pulseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      pulseTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "vote") return;
    const savedScrollY = localStorage.getItem(voteScrollPositionKey);
    if (!savedScrollY) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: Number(savedScrollY), behavior: "auto" });
    });
    localStorage.removeItem(voteScrollPositionKey);
  }, [activeTab]);

  const votesByCurrentUserAndArtist = useMemo(() => {
    const map = new Map<string, Vote>();
    votes
      .filter((vote) => vote.voter.toLowerCase() === voterName.trim().toLowerCase())
      .forEach((vote) => map.set(vote.artistId, vote));
    return map;
  }, [votes, voterName]);

  const personalVoterOptions = useMemo(() => {
    const unique = [...new Set(votes.map((vote) => vote.voter.trim()).filter(Boolean))];
    return unique.sort((left, right) => left.localeCompare(right));
  }, [votes]);

  const personalLeaderboard = useMemo(() => {
    if (!selectedPersonalVoter) return [];

    const artistsById = new Map(artists.map((artist) => [artist.id, artist] as const));

    return votes
      .filter((vote) => vote.voter.toLowerCase() === selectedPersonalVoter.toLowerCase())
      .map((vote) => {
        const artist = artistsById.get(vote.artistId);
        if (!artist?.runningOrder) return null;
        return {
          artistId: vote.artistId,
          label: artist.country || artist.name || vote.artistId,
          flag: artist.flag,
          runningOrder: artist.runningOrder,
          total: vote.total,
          song: vote.song,
          show: vote.show,
        };
      })
      .filter((vote): vote is NonNullable<typeof vote> => Boolean(vote))
      .sort((left, right) => right.total - left.total || right.song - left.song || right.show - left.show);
  }, [artists, selectedPersonalVoter, votes]);

  const predictionWinners = useMemo(() => {
    const qualifiedSet = new Set(
      Object.entries(qualifiedByArtistId)
        .filter(([, qualified]) => qualified)
        .map(([id]) => id)
    );
    if (!qualifiedSet.size || !votes.length) return [];

    const voterVotes = new Map<string, { artistId: string; total: number }[]>();
    for (const vote of votes) {
      const list = voterVotes.get(vote.voter) ?? [];
      list.push({ artistId: vote.artistId, total: vote.total });
      voterVotes.set(vote.voter, list);
    }

    const results = [...voterVotes.entries()]
      .map(([voter, list]) => {
        const personalTop10 = [...list].sort((left, right) => right.total - left.total).slice(0, 10);
        const matched = personalTop10.filter((item) => qualifiedSet.has(item.artistId));
        return {
          voter,
          matches: matched.length,
          matchedTotal: matched.reduce((sum, item) => sum + item.total, 0),
        };
      })
      .sort((left, right) => right.matches - left.matches || right.matchedTotal - left.matchedTotal);

    return results;
  }, [votes, qualifiedByArtistId]);

  const qualificationStandings = useMemo(() => {
    const qualifiedSet = new Set(
      Object.entries(qualifiedByArtistId)
        .filter(([, qualified]) => qualified)
        .map(([id]) => id)
    );
    if (!qualifiedSet.size || !votes.length) return [];

    const voterVotes = new Map<string, { artistId: string; total: number }[]>();
    for (const vote of votes) {
      const list = voterVotes.get(vote.voter) ?? [];
      list.push({ artistId: vote.artistId, total: vote.total });
      voterVotes.set(vote.voter, list);
    }

    const standings = [...voterVotes.entries()]
      .map(([voter, list]) => {
        const top10 = [...list].sort((left, right) => right.total - left.total).slice(0, 10);
        const matches = top10.filter((item) => qualifiedSet.has(item.artistId)).length;
        const totalScore = top10.reduce((sum, item) => sum + item.total, 0);
        return { voter, matches, totalScore };
      })
      .sort((left, right) => right.matches - left.matches || right.totalScore - left.totalScore);

    return standings;
  }, [votes, qualifiedByArtistId]);

  const funStats = useMemo(() => {
    if (!votes.length) return null;

    const voterList = [...new Set(votes.map((v) => v.voter.trim()).filter(Boolean))];
    if (voterList.length < 2) return null;

    const artistById = new Map(artists.map((a) => [a.id, a]));

    // Build per-voter maps
    const voterMap = new Map<string, Map<string, { total: number; song: number; show: number }>>();
    for (const vote of votes) {
      let map = voterMap.get(vote.voter);
      if (!map) {
        map = new Map();
        voterMap.set(vote.voter, map);
      }
      map.set(vote.artistId, { total: vote.total, song: vote.song, show: vote.show });
    }

    // ---- Twin Flames & Villain Arc (ranking correlation) ----
    function getRankings(voter: string) {
      const map = voterMap.get(voter);
      if (!map) return [];
      return [...map.entries()].sort((a, b) => b[1].total - a[1].total).map(([id], i) => ({ artistId: id, rank: i + 1 }));
    }

    function rankCorrelation(a: { artistId: string; rank: number }[], b: { artistId: string; rank: number }[]) {
      const shared = a.filter((aa) => b.some((bb) => bb.artistId === aa.artistId)).map((aa) => aa.artistId);
      if (shared.length < 2) return 0;
      const aRanks = shared.map((id) => a.find((x) => x.artistId === id)!.rank);
      const bRanks = shared.map((id) => b.find((x) => x.artistId === id)!.rank);
      // Kendall Tau-like: count concordant - discordant pairs
      let concordant = 0;
      let discordant = 0;
      for (let i = 0; i < shared.length; i++) {
        for (let j = i + 1; j < shared.length; j++) {
          const aDiff = aRanks[i] - aRanks[j];
          const bDiff = bRanks[i] - bRanks[j];
          if (aDiff * bDiff > 0) concordant++;
          else if (aDiff * bDiff < 0) discordant++;
        }
      }
      const total = concordant + discordant;
      return total === 0 ? 0 : (concordant - discordant) / total;
    }

    let bestCorrelation = -1;
    let twinFlames: [string, string] | null = null;
    let worstCorrelation = 1;
    let villainArc: [string, string] | null = null;

    for (let i = 0; i < voterList.length; i++) {
      for (let j = i + 1; j < voterList.length; j++) {
        const a = getRankings(voterList[i]);
        const b = getRankings(voterList[j]);
        const corr = rankCorrelation(a, b);
        if (corr > bestCorrelation) {
          bestCorrelation = corr;
          twinFlames = [voterList[i], voterList[j]];
        }
        if (corr < worstCorrelation) {
          worstCorrelation = corr;
          villainArc = [voterList[i], voterList[j]];
        }
      }
    }

    // ---- Most Generous / Most Ruthless ----
    const voterAvgs = voterList.map((voter) => {
      const map = voterMap.get(voter)!;
      const totals = [...map.values()].map((v) => v.total);
      const avg = totals.reduce((s, t) => s + t, 0) / totals.length;
      return { voter, avg, count: totals.length };
    });
    const mostGenerous = [...voterAvgs].sort((a, b) => b.avg - a.avg)[0];
    const mostRuthless = [...voterAvgs].sort((a, b) => a.avg - b.avg)[0];

    // ---- Controversial & Consensus artists ----
    const artistVotes = new Map<string, number[]>();
    for (const vote of votes) {
      const list = artistVotes.get(vote.artistId) ?? [];
      list.push(vote.total);
      artistVotes.set(vote.artistId, list);
    }
    const artistStats = [...artistVotes.entries()].map(([id, list]) => {
      const mean = list.reduce((s, t) => s + t, 0) / list.length;
      const variance = list.reduce((s, t) => s + Math.pow(t - mean, 2), 0) / list.length;
      const artist = artistById.get(id);
      return { id, name: artist?.country || artist?.name || id, flag: artist?.flag, mean, stdDev: Math.sqrt(variance), count: list.length };
    });
    const mostControversial = [...artistStats].sort((a, b) => b.stdDev - a.stdDev)[0];
    const mostConsensus = [...artistStats].sort((a, b) => a.stdDev - b.stdDev)[0];

    // ---- Biggest Glow-Up (show > song) ----
    const glowUps = [...artistVotes.entries()].map(([id, _totals]) => {
      const songScores = votes.filter((v) => v.artistId === id).map((v) => v.song);
      const showScores = votes.filter((v) => v.artistId === id).map((v) => v.show);
      const songAvg = songScores.reduce((s, t) => s + t, 0) / songScores.length;
      const showAvg = showScores.reduce((s, t) => s + t, 0) / showScores.length;
      const artist = artistById.get(id);
      return { id, name: artist?.country || artist?.name || id, flag: artist?.flag, gap: showAvg - songAvg, songAvg, showAvg };
    }).filter((a) => !Number.isNaN(a.gap));
    const biggestGlowUp = [...glowUps].sort((a, b) => b.gap - a.gap)[0];
    const biggestLetDown = [...glowUps].sort((a, b) => a.gap - b.gap)[0];

    // ---- Most Polarizing Pair (single-artist disagreement) ----
    let maxDisagreement = 0;
    let polarizingPair: { voterA: string; voterB: string; artist: string; diff: number } | null = null;
    for (const [artistId, list] of artistVotes) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const voteA = votes.find((v) => v.artistId === artistId && v.total === list[i]);
          const voteB = votes.find((v) => v.artistId === artistId && v.total === list[j]);
          if (!voteA || !voteB || voteA.voter === voteB.voter) continue;
          const diff = Math.abs(voteA.total - voteB.total);
          if (diff > maxDisagreement) {
            maxDisagreement = diff;
            const artist = artistById.get(artistId);
            polarizingPair = { voterA: voteA.voter, voterB: voteB.voter, artist: artist?.country || artist?.name || artistId, diff };
          }
        }
      }
    }

    // ---- Secret Alliance (most similar top 3) ----
    function getTop3(voter: string) {
      const map = voterMap.get(voter);
      if (!map) return [];
      return [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 3).map(([id]) => id);
    }
    let bestAlliance = 0;
    let secretAlliance: [string, string] | null = null;
    for (let i = 0; i < voterList.length; i++) {
      for (let j = i + 1; j < voterList.length; j++) {
        const a = getTop3(voterList[i]);
        const b = getTop3(voterList[j]);
        const shared = a.filter((id) => b.includes(id)).length;
        if (shared > bestAlliance) {
          bestAlliance = shared;
          secretAlliance = [voterList[i], voterList[j]];
        }
      }
    }

    // ---- The Harshest Critic & The Softie (single extreme score) ----
    const lowestVote = [...votes].sort((a, b) => a.total - b.total)[0];
    const highestVote = [...votes].sort((a, b) => b.total - a.total)[0];

    return {
      twinFlames,
      twinFlamesScore: bestCorrelation,
      villainArc,
      villainArcScore: worstCorrelation,
      mostGenerous,
      mostRuthless,
      mostControversial,
      mostConsensus,
      biggestGlowUp,
      biggestLetDown,
      polarizingPair,
      secretAlliance,
      secretAllianceOverlap: bestAlliance,
      harshestCritic: lowestVote ? { voter: lowestVote.voter, artist: artistById.get(lowestVote.artistId)?.country || artistById.get(lowestVote.artistId)?.name || lowestVote.artistId, total: lowestVote.total } : null,
      softie: highestVote ? { voter: highestVote.voter, artist: artistById.get(highestVote.artistId)?.country || artistById.get(highestVote.artistId)?.name || highestVote.artistId, total: highestVote.total } : null,
    };
  }, [votes, artists]);

  const partyMembersLabel = useMemo(() => {
    const namesByKey = new Map<string, { name: string; lastSeenMs: number }>();

    for (const event of presenceEvents) {
      const name = event.voter.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const seenMs = Date.parse(event.joinedAt ?? "0") || 0;
      const current = namesByKey.get(key);
      if (!current || seenMs >= current.lastSeenMs) {
        namesByKey.set(key, { name, lastSeenMs: seenMs });
      }
    }

    for (const participant of participants) {
      const name = participant.voter.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const seenMs = Date.parse(participant.lastSeenAt ?? "0") || 0;
      const current = namesByKey.get(key);
      if (!current || seenMs >= current.lastSeenMs) {
        namesByKey.set(key, { name, lastSeenMs: seenMs });
      }
    }

    for (const vote of votes) {
      const name = vote.voter.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const seenMs = Date.parse(vote.updatedAt ?? vote.createdAt ?? "0") || 0;
      const current = namesByKey.get(key);
      if (!current || seenMs >= current.lastSeenMs) {
        namesByKey.set(key, { name, lastSeenMs: seenMs });
      }
    }

    const names = [...namesByKey.values()]
      .sort((left, right) => right.lastSeenMs - left.lastSeenMs || left.name.localeCompare(right.name))
      .map((entry) => entry.name);

    return names.length ? `Party: ${names.join(" · ")}` : "";
  }, [participants, presenceEvents, votes]);

  const rankedVotesByArtist = useMemo(() => {
    const byArtist = new Map<string, { voter: string; song: number; show: number; total: number; updatedAt?: string }[]>();
    for (const vote of votes) {
      const list = byArtist.get(vote.artistId) ?? [];
      list.push({ voter: vote.voter, song: vote.song, show: vote.show, total: vote.total, updatedAt: vote.updatedAt });
      byArtist.set(vote.artistId, list);
    }
    for (const [artistId, list] of byArtist) {
      byArtist.set(
        artistId,
        list.sort((left, right) => right.total - left.total || Date.parse(right.updatedAt ?? "0") - Date.parse(left.updatedAt ?? "0"))
      );
    }
    return byArtist;
  }, [votes]);

  function getDraftScore(artistId: string) {
    const existingDraftScore = draftScoresByArtist[artistId];
    if (existingDraftScore) {
      return {
        song: normalizeEurovisionPoints(existingDraftScore.song),
        show: normalizeEurovisionPoints(existingDraftScore.show),
      };
    }
    const previousVote = votesByCurrentUserAndArtist.get(artistId);
    if (previousVote) {
      return {
        song: normalizeEurovisionPoints(previousVote.song),
        show: normalizeEurovisionPoints(previousVote.show),
      };
    }
    return defaultScores;
  }

  function updateDraftScore(artistId: string, field: "song" | "show", value: number) {
    const currentScore = getDraftScore(artistId);
    setDraftScoresByArtist((previous) => ({
      ...previous,
      [artistId]: { ...currentScore, [field]: normalizeEurovisionPoints(value) },
    }));
  }

  function launchConfettiCannon(x: number, y: number, totalScore: number) {
    const originX = Math.max(0, Math.min(1, x / window.innerWidth));
    const originY = Math.max(0, Math.min(1, y / window.innerHeight));
    const normalized = Math.max(0, Math.min(1, totalScore / 24));
    confetti({
      particleCount: Math.round(30 + normalized * 120),
      spread: Math.round(40 + normalized * 38),
      startVelocity: Math.round(30 + normalized * 34),
      gravity: 1.1,
      ticks: 180,
      scalar: 0.62 + normalized * 0.42,
      colors: ["#ff0178", "#8b3dff", "#2200ff", "#f5d547", "#ffffff"],
      origin: { x: originX, y: originY },
    });
  }

  async function submitVote(artistId: string, clickEvent?: MouseEvent<HTMLButtonElement>) {
    setErrorMessage("");
    if (!activeRoomCode) {
      setErrorMessage("Create or join a party first.");
      return;
    }
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
      body: JSON.stringify({ room: activeRoomCode, voter: voterName.trim(), artistId, song: score.song, show: score.show }),
    });
    setSavingVoteForArtistId(null);

    if (!response.ok) {
      setErrorMessage("Vote failed. Try again.");
      return;
    }

    const nextState = (await response.json()) as StateResponse;
    applyState(nextState);
    launchConfettiCannon(effectX, effectY, total);
  }

  async function submitReaction(artistId: string, emoji: string, exact = false) {
    if (!activeRoomCode) {
      setErrorMessage("Create or join a party first.");
      return;
    }
    if (!voterName.trim()) {
      setErrorMessage("Enter your name first.");
      return;
    }

    const response = await fetch("/api/reaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: activeRoomCode, voter: voterName.trim(), artistId, emoji, exact }),
    });

    if (!response.ok) {
      setErrorMessage("Could not send reaction.");
      return;
    }

    const nextState = (await response.json()) as StateResponse;
    applyState(nextState);
  }

  const customEmojiOptions = ["🤮", "😵", "🙈", "🤣", "😭", "😤", "🥱", "😎", "🔥", "💃", "🕺", "🎉", "💯", "👑", "🫶", "🤯", "😈", "🥳", "🤠", "😇", "🧨", "⚡", "🌈", "💥", "🎯", "🛸", "🦄", "🐉", "🧠", "💅", "🫡", "😜", "🤪", "🥶", "😱", "😏", "🤌", "🫠", "🙃", "🥲", "😬", "🤷", "🫣", "💀", "☠️", "😀", "😁", "😆", "😅", "😂", "🙂", "😍", "🥰", "😘", "😋", "😛", "😝", "🤓", "😴", "😪", "🤤", "😬", "🤢", "🤧", "🥵", "🥸", "👻", "🤡", "💩", "👽", "🎃", "🤝", "👏", "🙌", "👍", "👎", "🙏", "✌️", "🤘", "🫡", "🫶", "💪", "🧡", "💜", "💙", "💚", "🖤", "💔", "❤️", "💕", "💖", "💗", "💓", "💘", "💝", "✨", "🌟", "⭐", "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️", "❄️", "☃️", "💨", "🌬️", "🌫️", "🌁", "🌂", "☂️", "☔", "🌈", "🌞", "🌛", "🌪️", "🌊", "🌋", "🌌", "🎶", "🎧", "🎤", "🎬", "🏆", "🥇", "🚀", "🛹", "🏄", "⚽", "🏀", "🎾", "🐶", "🐱", "🦊", "🐺", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐵", "🙊", "🙉", "🙈", "🐸", "🐰", "🐹", "🐭", "🐗", "🐴", "🦄", "🐝", "🐞", "🕷️", "🦂", "🦋", "🐢", "🐍", "🦎", "🐙", "🦑", "🦐", "🦞", "🐠", "🐟", "🐡", "🦈", "🐬", "🐳", "🦭", "🦦", "🦥", "🦔", "🦘", "🦬", "🦒", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🦙", "🦣", "🐓", "🐔", "🦃", "🦉", "🦅", "🕊️", "🐧", "🦜", "🦩", "🦚", "🐿️", "🌸", "🌺", "🍀", "🪩", "🧠", "🔮", "🧲", "📈", "💸", "🧾", "👗", "👚", "👕", "👔", "👖", "🧥", "🧶", "🧣", "🧤", "🧦", "👠", "👡", "👢", "👟", "🥾", "🥿", "👒", "🎩", "🧢", "👑", "👜", "👛", "🕶️", "💍", "📿", "🩱", "🩲", "🥻", "👘", "🪭", "🎭", "🕺", "💃", "🪩", "🎆", "🎇", "🧨", "🔥", "💨", "⚡", "🌈", "🎤", "🎙️", "🎚️", "🎛️", "🔊", "🎵", "🎶", "✨", "💫", "🌟", "⭐"];

  const everyoneHasVoted = artists.length > 0 && artists.every((artist) => votesByCurrentUserAndArtist.has(artist.id));

  function joinParty() {
    const name = voterName.trim();
    if (!name) {
      setErrorMessage("Type your name, then press Join.");
      return;
    }
    setErrorMessage("");
    setJoinedName(name);
    setShowJoinedNotice(true);
    localStorage.setItem("mello-voter-name", name);
    setActiveTab("vote");

    if (activeRoomCode) {
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: activeRoomCode, voter: name }),
      }).catch(() => {
        // best-effort broadcast only
      });
    }
  }

  async function createRoom() {
    setRoomActionLoading(true);
    setErrorMessage("");
    const response = await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", voter: voterName.trim() || undefined }),
    });
    setRoomActionLoading(false);

    if (!response.ok) {
      setErrorMessage("Could not create party. Try again.");
      return;
    }

    const payload = (await response.json()) as RoomApiResponse;
    if (!payload.roomCode) {
      setErrorMessage("Could not create party. Try again.");
      return;
    }

    setActiveRoomCode(payload.roomCode);
    setRoomCodeInput(payload.roomCode);
    setJoinedName("");
    voteSnapshotRef.current = new Map();
    voteSnapshotInitializedRef.current = false;
    presenceSnapshotRef.current = new Map();
    presenceSnapshotInitializedRef.current = false;
    reactionSnapshotRef.current = new Map();
    reactionSnapshotInitializedRef.current = false;
    setShowCreateRoom(false);
    setRoomCodeInUrl(payload.roomCode);
    localStorage.setItem(roomCodeStorageKey, payload.roomCode);
    localStorage.setItem("mello-room-creator", voterName.trim());
    setLoading(true);
    loadRoomState(payload.roomCode)
      .catch(() => setErrorMessage("Could not load party votes."))
      .finally(() => setLoading(false));
  }

  async function joinRoom() {
    const room = roomCodeInput.trim().toUpperCase();
    if (!room) {
      setErrorMessage("Enter a party code.");
      return;
    }

    setRoomActionLoading(true);
    setErrorMessage("");
    const response = await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", room }),
    });
    setRoomActionLoading(false);

    if (!response.ok) {
      setErrorMessage(response.status === 404 ? "Party not found." : "Could not join party.");
      return;
    }

    const payload = (await response.json()) as RoomApiResponse;
    if (!payload.roomCode) {
      setErrorMessage("Could not join party.");
      return;
    }

    setActiveRoomCode(payload.roomCode);
    setRoomCodeInput(payload.roomCode);
    setJoinedName("");
    voteSnapshotRef.current = new Map();
    voteSnapshotInitializedRef.current = false;
    presenceSnapshotRef.current = new Map();
    presenceSnapshotInitializedRef.current = false;
    reactionSnapshotRef.current = new Map();
    reactionSnapshotInitializedRef.current = false;
    setRoomCodeInUrl(payload.roomCode);
    localStorage.setItem(roomCodeStorageKey, payload.roomCode);
    setLoading(true);
    loadRoomState(payload.roomCode)
      .catch(() => setErrorMessage("Could not load party votes."))
      .finally(() => setLoading(false));
  }

  function leaveRoom() {
    setActiveRoomCode("");
    setRoomCodeInput("");
    setLoading(false);
    setJoinedName("");
    setVoterName("");
    setShowCreateRoom(false);
    setShowJoinedNotice(false);
    setArtists([]);
    setVotes([]);
    setLeaderboard([]);
    setPresenceEvents([]);
    setParticipants([]);
    setVotePulseItems([]);
    setJoinToastItems([]);
    voteSnapshotRef.current = new Map();
    voteSnapshotInitializedRef.current = false;
    presenceSnapshotRef.current = new Map();
    presenceSnapshotInitializedRef.current = false;
    reactionSnapshotRef.current = new Map();
    reactionSnapshotInitializedRef.current = false;
    localStorage.removeItem(roomCodeStorageKey);
    localStorage.removeItem("mello-voter-name");
    localStorage.removeItem("mello-room-creator");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      window.history.replaceState({}, "", url.toString());
    }
  }

  async function copyPartyLink() {
    if (!activeRoomCode) return;
    const copied = await copyText(getSharePartyUrl(activeRoomCode));
    setShareCopyFeedback(copied ? "Copied" : "Copy failed");
    window.setTimeout(() => setShareCopyFeedback(""), 1400);
  }

  function refreshToLatestVersion() {
    localStorage.setItem(refreshToastVersion, "done");
    setShowRefreshToast(false);
    localStorage.setItem(scrollPositionKey, String(window.scrollY));
    window.location.reload();
  }

  function switchTab(nextTab: "vote" | "board") {
    if (activeTab === "vote" && nextTab !== "vote") {
      localStorage.setItem(voteScrollPositionKey, String(window.scrollY));
    }
    if (nextTab === "board") {
      window.scrollTo(0, 0);
    }
    localStorage.setItem(activeTabStorageKey, nextTab);
    setActiveTab(nextTab);
  }

  function scrollToArtistCard(artistId: string) {
    switchTab("vote");

    let attempts = 0;
    const maxAttempts = 18;

    const jumpToArtist = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-artist-card-id]"));
      const matchingCards = cards.filter((card) => card.dataset.artistCardId === artistId);
      const visibleCard = matchingCards.find((card) => card.offsetParent !== null);
      const card = visibleCard ?? matchingCards[0];

      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        window.requestAnimationFrame(jumpToArtist);
      }
    };

    window.requestAnimationFrame(jumpToArtist);
  }

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
      <div className={`mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10 ${activeRoomCode && joinedName ? "pb-24 md:pb-10" : ""}`}>
        <div className="z-40 mb-2 flex items-center justify-between gap-2">
          <div className="w-fit rounded-full border border-fuchsia-300/30 bg-black/55 px-3 py-1 shadow-lg backdrop-blur">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={officialEurovisionLogo} alt="Eurovision Song Contest official logo" className="h-5 w-auto object-contain" />
          </div>
          {activeRoomCode ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copyPartyLink()}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 shadow-lg backdrop-blur hover:bg-white/20"
              >
                {shareCopyFeedback || "Share party"}
              </button>
              <button type="button" onClick={leaveRoom} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 shadow-lg backdrop-blur hover:bg-white/20">
                Leave party
              </button>
            </div>
          ) : null}
        </div>

        <header className="mb-2 rounded-xl border border-white/15 bg-black/35 p-3 shadow-xl backdrop-blur">
          <p className="mb-1 hidden rounded-full bg-yellow-300 px-2 py-0.5 text-xs font-bold tracking-wider text-black sm:inline-block">
            {eventInfo ? `${eventInfo.country} ${eventInfo.name.toUpperCase()}` : "LOADING EVENT..."}
          </p>
          <h1 className="text-lg font-black uppercase tracking-wide sm:text-xl md:text-3xl">Semifinal 1 · Vienna 2026</h1>
          <p className="mt-2 hidden max-w-3xl text-sm text-white/85 md:block md:text-base">
            Semi-Final 1 is tonight! Rate each act on <strong>Song</strong> and <strong>Show</strong>.
            Total is automatic. No login, only glory. United by Music 🎵
          </p>

          {!activeRoomCode ? (
          <div className="mt-4 rounded-2xl border border-white/15 bg-black/35 p-4 shadow-lg">
            {
              <div className="mx-auto max-w-md space-y-3">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Join party</p>
                <div className="space-y-2">
                  <input
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                    placeholder="Party code (e.g. AB3K9Q)"
                    maxLength={6}
                    className="w-full rounded-xl border border-white/25 bg-black/25 px-4 py-2.5 text-center font-mono text-base uppercase tracking-[0.3em] text-white placeholder:text-white/45 focus:border-fuchsia-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void joinRoom()}
                    disabled={roomActionLoading}
                    className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-fuchsia-900/35 disabled:opacity-50"
                  >
                    {roomActionLoading ? "Joining…" : "Join party"}
                  </button>
                </div>
                <p className="text-center text-xs text-white/70">
                  Need a new party?{" "}
                  <button
                    type="button"
                    onClick={() => setShowCreateRoom((current) => !current)}
                    className="font-semibold text-fuchsia-200 underline decoration-fuchsia-300/50 underline-offset-2"
                  >
                    Create party
                  </button>
                </p>
                {showCreateRoom ? (
                  <div className="rounded-xl border border-fuchsia-300/25 bg-fuchsia-950/25 p-3">
                    <p className="mb-2 text-xs text-white/80">Generate a party code and share it manually with your group.</p>
                    <button
                      type="button"
                      onClick={() => void createRoom()}
                      disabled={roomActionLoading}
                      className="w-full rounded-xl bg-white/15 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                    >
                      {roomActionLoading ? "Creating…" : "Create a new party"}
                    </button>
                  </div>
                ) : null}
              </div>
            }
          </div>
          ) : null}

          {activeRoomCode ? (
            <div className="mt-3">
              {!joinedName ? (
                <div className="mx-auto flex max-w-md flex-col gap-2">
                  <input
                    value={voterName}
                    onChange={(event) => setVoterName(event.target.value)}
                    placeholder="Your name (e.g. Björn)"
                    className="w-full rounded-xl border border-white/30 bg-black/25 px-4 py-2 text-white placeholder:text-white/50 focus:border-cyan-300 focus:outline-none"
                  />
                  <button onClick={joinParty} className="rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 px-4 py-2 font-black text-white shadow-lg shadow-fuchsia-900/30">
                    Continue to voting
                  </button>
                </div>
              ) : showJoinedNotice ? (
                <p className="flex items-center rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                  Joined as <strong className="ml-1">{joinedName}</strong>
                </p>
              ) : null}
            </div>
          ) : null}

          {activeRoomCode && partyMembersLabel ? <p className="mt-2 text-xs text-white/75">{partyMembersLabel}</p> : null}
        </header>

        {errorMessage ? (
          <div className="fixed left-1/2 top-4 z-[70] w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-rose-300/40 bg-rose-950/95 p-3 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2">
              <p className="text-sm text-rose-100">{errorMessage}</p>
              <button onClick={() => setErrorMessage("")} className="ml-auto rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-white">
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {showRefreshToast ? (
          <div className="fixed bottom-3 left-1/2 z-[60] w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-cyan-200/40 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white">
                New version available. <span className="font-bold from-fuchsia-300">Refresh to get latest version.</span>
              </p>
              <button onClick={refreshToLatestVersion} className="ml-auto rounded-lg bg-cyan-300 px-3 py-1.5 text-xs font-black text-black">
                Refresh now
              </button>
            </div>
          </div>
        ) : null}

        {showJoinToasts && joinToastItems.length ? (
          <div className="pointer-events-none fixed right-3 top-[6.5rem] z-[65] flex max-w-[92vw] flex-col gap-2">
            {joinToastItems.map((toast) => (
              <div key={toast.id} className="vote-pulse-toast rounded-2xl border border-white/20 bg-black/70 px-3 py-2 text-sm text-white shadow-xl backdrop-blur-sm">
                <span className="mr-1" aria-hidden>👋</span>
                <strong>{toast.voter}</strong> joined the party
              </div>
            ))}
          </div>
        ) : null}

        {showVotePulseDock ? <VotePulseDock items={votePulseItems} active={activeTab === "vote"} onSelectArtist={scrollToArtistCard} /> : null}

        {!activeRoomCode ? (
          <div className="rounded-2xl border border-cyan-300/25 bg-black/35 p-8 text-center text-white/85">
            Create or join a party to start voting with your group.
          </div>
        ) : !joinedName ? (
          <div className="rounded-2xl border border-cyan-300/25 bg-black/35 p-8 text-center text-white/85">
            Enter your name to continue into the party.
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-white/20 bg-white/10 p-8 text-center text-white/80">Loading party data…</div>
        ) : activeTab === "vote" ? (
          <section>
            {phase.votingCompleted ? (
              <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-emerald-100">🗳️ Voting is complete! Check out the Results.</p>
                  <button
                    onClick={() => switchTab("board")}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-white"
                  >
                    Go to Results →
                  </button>
                </div>
              </div>
            ) : null}
            <MobileVoteDeck
              artists={artists}
              getDraftScore={getDraftScore}
              updateDraftScore={updateDraftScore}
              getSortedVotesForArtist={(artistId) => rankedVotesByArtist.get(artistId) ?? []}
              savingVoteForArtistId={savingVoteForArtistId}
              submitVote={submitVote}
              submitReaction={submitReaction}
              votingCompleted={phase.votingCompleted}
              onGoToResults={() => switchTab("board")}
            />

            <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
              {artists.map((artist, index) => {
                const score = getDraftScore(artist.id);
                const total = score.song + score.show;
                const hasVoted = votesByCurrentUserAndArtist.has(artist.id);

                return (
                  <article key={artist.id} data-artist-card-id={artist.id} className="overflow-hidden rounded-2xl border border-white/25 bg-white/10 shadow-xl backdrop-blur">
                    <div className="relative h-44 w-full bg-black/30">
                      {artist.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={artist.imageUrl} alt={artist.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-5xl">🎤</div>
                      )}
                      <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-sm font-bold">#{index + 1}</div>
                    </div>

                    <div className="p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h2 className="flex flex-wrap items-center gap-x-2 text-xl font-extrabold">
                          {artist.country ? <span>{artist.country} •</span> : null}
                          <span>{artist.name}</span>
                        </h2>
                        {hasVoted ? (
                          <span className="rounded-full bg-emerald-300 px-2 py-1 text-sm font-bold text-black">Voted</span>
                        ) : (
                          <span className="rounded-full bg-white/20 px-2 py-1 text-sm font-semibold text-white/80">Not voted</span>
                        )}
                      </div>

                      {artist.song ? <p className="mb-3 text-base from-fuchsia-300">♪ {artist.song}</p> : null}

                      {phase.votingCompleted ? (
                        <button
                          onClick={() => switchTab("board")}
                          className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2 text-base font-black text-white shadow-lg"
                        >
                          Go to Results →
                        </button>
                      ) : (
                        <>
                          <Slider
                            label="Song"
                            value={score.song}
                            min={0}
                            max={12}
                            onChange={(value) => updateDraftScore(artist.id, "song", value)}
                            valueDisplay={<span className="text-cyan-300">{score.song}</span>}
                          />

                          <Slider
                            label="Show"
                            value={score.show}
                            min={0}
                            max={12}
                            onChange={(value) => updateDraftScore(artist.id, "show", value)}
                            valueDisplay={<span className="text-amber-300">{score.show}</span>}
                          />

                          <div className="mb-4 text-base text-white/85">Total: <span className="text-2xl font-black text-cyan-300">{total}</span></div>

                          <button
                            onClick={(event) => submitVote(artist.id, event)}
                            disabled={savingVoteForArtistId === artist.id}
                            className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 px-4 py-2 text-base font-black text-white shadow-lg shadow-fuchsia-900/25 disabled:opacity-50"
                          >
                            {savingVoteForArtistId === artist.id ? "Saving…" : hasVoted ? "Update vote" : "Submit vote"}
                          </button>

                          <div className="mt-2 grid grid-cols-6 gap-1.5">
                            {[
                              { emoji: "😳", label: "Cringe" },
                              { emoji: "👎", label: "Thumbs down" },
                              { emoji: "😂", label: "Laughing" },
                              { emoji: "👏", label: "Clapping" },
                              { emoji: "👍", label: "Thumbs up" },
                            ].map((option) => (
                              <button
                                key={option.emoji}
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void submitReaction(artist.id, option.emoji);
                                }}
                                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-2 py-2 text-lg"
                                aria-label={option.label}
                                title={option.label}
                              >
                                {option.emoji}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setOpenEmojiPickerArtistId((current) => (current === artist.id ? null : artist.id))}
                              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-2 py-2 text-lg"
                              aria-label="Custom emoji"
                              title="Custom emoji"
                            >
                              ➕
                            </button>
                          </div>

                          {openEmojiPickerArtistId === artist.id ? (
                            <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-white/50 bg-white/65 p-2 backdrop-blur-sm [scrollbar-gutter:stable_both-edges]">
                              <div className="grid grid-cols-10 gap-1.5">
                                {customEmojiOptions.map((emoji) => (
                                  <button
                                    key={`${artist.id}-${emoji}`}
                                    type="button"
                                    onClick={() => {
                                      void submitReaction(artist.id, emoji, true);
                                      setOpenEmojiPickerArtistId(null);
                                    }}
                                    className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/20 px-1 py-1.5 text-3xl leading-none"
                                    aria-label={`React with ${emoji}`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 hidden justify-center md:flex">
              <button
                onClick={() => switchTab("board")}
                className={`rounded-2xl px-6 py-3 text-base font-black transition ${
                  everyoneHasVoted
                    ? "bg-emerald-300 text-black hover:scale-[1.02]"
                    : "bg-white/15 text-white"
                }`}
              >
                {everyoneHasVoted ? "See results 🏆" : "Results"}
              </button>
            </div>
          </section>
        ) : (
          <div className="flex flex-col gap-4">
            {phase.scoringCompleted && predictionWinners.length ? (
              <div className="rounded-xl border border-yellow-400/40 bg-yellow-500/20 p-4">
                <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-yellow-100">🏆 Prediction Winners</h3>
                {(() => {
                  let rank = 1;
                  let displayed = 0;
                  const nodes = [];
                  for (let index = 0; index < predictionWinners.length; index++) {
                    const winner = predictionWinners[index];
                    if (index > 0 && winner.matches !== predictionWinners[index - 1]?.matches) {
                      rank = displayed + 1;
                    }
                    if (rank > 3) break;
                    displayed++;
                    const isFirst = rank === 1;
                    const isSecond = rank === 2;
                    const isThird = rank === 3;
                    nodes.push(
                      <div key={winner.voter} className={`flex items-center gap-3 ${index > 0 ? "mt-2 border-t border-white/10 pt-2" : ""}`}>
                        <span className="text-2xl">
                          {isFirst ? "👑" : isSecond ? "🥈" : isThird ? "🥉" : `#${rank}`}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-black text-white">{winner.voter}</p>
                          <p className="text-xs text-yellow-100/80">{winner.matches}/10 qualified</p>
                        </div>
                      </div>
                    );
                  }
                  return nodes;
                })()}
              </div>
            ) : null}

            {phase.votingCompleted && qualificationStandings.length ? (
              <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/15 p-3">
                <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-yellow-100">🎯 Qualifier Predictions</h3>
                <div className="grid gap-1.5 md:grid-cols-2">
                  {qualificationStandings.map((row, index) => (
                    <div key={row.voter} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-black/25 px-2 py-1.5">
                      <span className="text-sm font-black tabular-nums text-yellow-300">#{index + 1}</span>
                      <span className="truncate text-sm font-bold text-white">{row.voter}</span>
                      <span className="text-sm font-black tabular-nums text-yellow-100">{row.matches}/10</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-white/15 bg-black/35 p-3">
              <div className="mb-3 flex items-end justify-between gap-2">
                <h2 className="text-xl font-black uppercase tracking-wide text-white">Results</h2>
                <select
                  value={selectedPersonalVoter}
                  onChange={(event) => setSelectedPersonalVoter(event.target.value)}
                  className="w-auto rounded-lg border border-white/30 bg-black/40 px-2 py-1 text-sm text-white"
                >
                  <option value="">Entire party</option>
                  {personalVoterOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedPersonalVoter ? (
                personalLeaderboard.length ? (
                  <div className="grid gap-1.5 md:grid-cols-2">
                    {personalLeaderboard.slice(0, 10).map((vote, index) => (
                      <div key={vote.artistId} className="grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                        <span className="text-sm font-black tabular-nums text-white/60">{index + 1}.</span>
                        <span className="truncate text-sm font-bold text-white">{vote.label}{vote.flag ? ` ${vote.flag}` : ""} <span className="text-xs font-semibold text-white/50">#{vote.runningOrder ?? "—"}</span></span>
                        {qualifiedByArtistId[vote.artistId] ? (
                          <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Qualified</span>
                        ) : <span />}
                        <span className="text-sm font-black tabular-nums text-cyan-200">{vote.total}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-white/70">No votes yet for this person.</p>
                )
              ) : (
                <div className="grid gap-1.5 md:grid-cols-2">
                  {leaderboard.map((row, index) => {
                    const runningOrder = artists.find((artist) => artist.id === row.artistId)?.runningOrder ?? index + 1;
                    return (
                      <div key={row.artistId} className="grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                        <span className="text-sm font-black tabular-nums text-white/60">{index + 1}.</span>
                        <span className="truncate text-sm font-bold text-white">{row.country || row.artistName}{row.flag ? ` ${row.flag}` : ""} <span className="text-xs font-semibold text-white/50">#{runningOrder}</span></span>
                        {qualifiedByArtistId[row.artistId] ? (
                          <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Qualified</span>
                        ) : <span />}
                        <span className="text-sm font-black tabular-nums text-cyan-200">{row.totalAverage.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {funStats && (
              <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4">
                <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-fuchsia-200">🧠 The Tea</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {funStats.twinFlames && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">🔮 Twin Flames</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.twinFlames[0]}</span> and <span className="font-bold text-white">{funStats.twinFlames[1]}</span> are basically the same person. Their rankings are {Math.round((funStats.twinFlamesScore + 1) * 50)}% aligned.
                      </p>
                    </div>
                  )}
                  {funStats.villainArc && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">⚔️ Villain Arc</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.villainArc[0]}</span> and <span className="font-bold text-white">{funStats.villainArc[1]}</span> fundamentally disagree on everything. Their tastes are {Math.round((1 - (funStats.villainArcScore + 1) / 2) * 100)}% opposed.
                      </p>
                    </div>
                  )}
                  {funStats.secretAlliance && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">🤝 Secret Alliance</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.secretAlliance[0]}</span> and <span className="font-bold text-white">{funStats.secretAlliance[1]}</span> share {funStats.secretAllianceOverlap} of their top 3 picks. Suspicious.
                      </p>
                    </div>
                  )}
                  {funStats.polarizingPair && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">💥 Most Heated Argument</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.polarizingPair.voterA}</span> and <span className="font-bold text-white">{funStats.polarizingPair.voterB}</span> had a <span className="font-bold text-white">{funStats.polarizingPair.diff}-point</span> disagreement over <span className="font-bold text-white">{funStats.polarizingPair.artist}</span>.
                      </p>
                    </div>
                  )}
                  {funStats.mostGenerous && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">🍰 The Softie</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.mostGenerous.voter}</span> is handing out points like candy. Average score: <span className="font-bold text-white">{funStats.mostGenerous.avg.toFixed(1)}</span>.
                      </p>
                    </div>
                  )}
                  {funStats.mostRuthless && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">🪑 Simon Cowell</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.mostRuthless.voter}</span> brought a chair to throw. Average score: <span className="font-bold text-white">{funStats.mostRuthless.avg.toFixed(1)}</span>.
                      </p>
                    </div>
                  )}
                  {funStats.mostControversial && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">🎭 Divisive Darling</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.mostControversial.name}</span> {funStats.mostControversial.flag} split the room. Score variance: <span className="font-bold text-white">{funStats.mostControversial.stdDev.toFixed(1)}</span>.
                      </p>
                    </div>
                  )}
                  {funStats.mostConsensus && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">🤷 Boring But Correct</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.mostConsensus.name}</span> {funStats.mostConsensus.flag} — everyone basically agrees. Variance: <span className="font-bold text-white">{funStats.mostConsensus.stdDev.toFixed(1)}</span>.
                      </p>
                    </div>
                  )}
                  {funStats.biggestGlowUp && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">✨ Glow-Up of the Night</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.biggestGlowUp.name}</span> {funStats.biggestGlowUp.flag} — the staging carried hard. Show ({funStats.biggestGlowUp.showAvg.toFixed(1)}) beat Song ({funStats.biggestGlowUp.songAvg.toFixed(1)}) by <span className="font-bold text-white">{funStats.biggestGlowUp.gap.toFixed(1)}</span> points.
                      </p>
                    </div>
                  )}
                  {funStats.biggestLetDown && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">📉 Staging Betrayal</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.biggestLetDown.name}</span> {funStats.biggestLetDown.flag} — great song, cursed staging. Song ({funStats.biggestLetDown.songAvg.toFixed(1)}) outshone Show ({funStats.biggestLetDown.showAvg.toFixed(1)}) by <span className="font-bold text-white">{Math.abs(funStats.biggestLetDown.gap).toFixed(1)}</span> points.
                      </p>
                    </div>
                  )}
                  {funStats.harshestCritic && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">💀 The Execution</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.harshestCritic.voter}</span> dropped a <span className="font-bold text-white">{funStats.harshestCritic.total}</span> on <span className="font-bold text-white">{funStats.harshestCritic.artist}</span>. Brutal.
                      </p>
                    </div>
                  )}
                  {funStats.softie && funStats.softie.total !== funStats.harshestCritic?.total && (
                    <div className="rounded-lg bg-black/25 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">🥹 True Believer</p>
                      <p className="mt-1 text-sm text-white/90">
                        <span className="font-bold text-white">{funStats.softie.voter}</span> gave <span className="font-bold text-white">{funStats.softie.artist}</span> a <span className="font-bold text-white">{funStats.softie.total}</span>. They see something we don&apos;t.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {activeRoomCode && joinedName ? (
        (roomCreator && voterName.trim().toLowerCase() === roomCreator.trim().toLowerCase()) || (!roomCreator && voterName.trim()) ? (
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-black/45 p-2 backdrop-blur-md md:hidden" aria-label="Footer navigation">
            <div className="mx-auto grid w-full grid-cols-3 gap-2">
              <button
                onClick={() => switchTab("vote")}
                role="tab"
                aria-selected={activeTab === "vote"}
                className={`rounded-xl px-2 py-2 text-xs font-bold transition sm:px-3 sm:text-sm ${
                  activeTab === "vote" ? "border border-white/35 bg-white/20 text-white" : "bg-white/10 text-white/85"
                }`}
              >
                Voting
              </button>
              <button
                onClick={() => switchTab("board")}
                role="tab"
                aria-selected={activeTab === "board"}
                className={`rounded-xl px-2 py-2 text-xs font-bold transition sm:px-3 sm:text-sm ${
                  activeTab === "board" ? "border border-white/35 bg-white/20 text-white" : "bg-white/10 text-white/85"
                }`}
              >
                <span className="sm:hidden">Results</span>
                <span className="hidden sm:inline">Results</span>
              </button>
              <Link
                href="/live-results"
                role="tab"
                className="rounded-xl bg-white/10 px-2 py-2 text-center text-xs font-bold text-white/85 transition hover:bg-white/20 sm:px-3 sm:text-sm"
              >
                <span className="sm:hidden">Admin</span>
                <span className="hidden sm:inline">Admin</span>
              </Link>
            </div>
          </nav>
        ) : (
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-black/45 p-2 backdrop-blur-md md:hidden" aria-label="Footer navigation">
            <div className="mx-auto grid w-full grid-cols-2 gap-2">
              <button
                onClick={() => switchTab("vote")}
                role="tab"
                aria-selected={activeTab === "vote"}
                className={`rounded-xl px-2 py-2 text-xs font-bold transition sm:px-3 sm:text-sm ${
                  activeTab === "vote" ? "border border-white/35 bg-white/20 text-white" : "bg-white/10 text-white/85"
                }`}
              >
                Voting
              </button>
              <button
                onClick={() => switchTab("board")}
                role="tab"
                aria-selected={activeTab === "board"}
                className={`rounded-xl px-2 py-2 text-xs font-bold transition sm:px-3 sm:text-sm ${
                  activeTab === "board" ? "border border-white/35 bg-white/20 text-white" : "bg-white/10 text-white/85"
                }`}
              >
                <span className="sm:hidden">Results</span>
                <span className="hidden sm:inline">Results</span>
              </button>
            </div>
          </nav>
        )
      ) : null}
    </main>
  );
}
