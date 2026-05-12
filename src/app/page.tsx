"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileVoteDeck } from "@/components/MobileVoteDeck";
import { Slider } from "@/components/slider";
import { VotePulseDock, type VotePulseItem } from "@/components/VotePulseDock";
import { normalizeEurovisionPoints } from "@/lib/eurovisionPoints";

type Artist = { id: string; name: string; song?: string; imageUrl?: string; country?: string };
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

type EventResponse = {
  active?: EventInfo | null;
};

const defaultScores = { song: 6, show: 6 };
const refreshToastVersion = "mello-refresh-toast-v1";
const scrollPositionKey = "mello-scroll-y";
const voteScrollPositionKey = "mello-vote-scroll-y";
const roomCodeStorageKey = "mello-room-code";
const officialEurovisionGradient = "radial-gradient(120% 150% at 90% -3%, #2200ff, #000c54 22.49%, #010a41 33.26%, #010a41 64.14%, #4c0a54 85.82%, #ff0178)";
const officialEurovisionLogo = "/eurovision-official-logo.svg";

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
  const [voterName, setVoterName] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem("mello-voter-name") ?? ""));
  const [artists, setArtists] = useState<Artist[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [activeTab, setActiveTab] = useState<"vote" | "board">("vote");
  const [loading, setLoading] = useState(() => (typeof window !== "undefined" ? Boolean(localStorage.getItem(roomCodeStorageKey)) : false));
  const [savingVoteForArtistId, setSavingVoteForArtistId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [joinedName, setJoinedName] = useState(() => {
    if (typeof window === "undefined") return "";
    const savedName = localStorage.getItem("mello-voter-name") ?? "";
    const savedParty = localStorage.getItem(roomCodeStorageKey) ?? "";
    return savedName && savedParty ? savedName : "";
  });
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [showRefreshToast, setShowRefreshToast] = useState(
    () => !(typeof window !== "undefined" && localStorage.getItem(refreshToastVersion) === "done")
  );
  const [votePulseItems, setVotePulseItems] = useState<VotePulseItem[]>([]);
  const [activeRoomCode, setActiveRoomCode] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem(roomCodeStorageKey) ?? ""));
  const [roomCodeInput, setRoomCodeInput] = useState(() => getRoomCodeFromUrl());
  const [roomActionLoading, setRoomActionLoading] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [shareCopyFeedback, setShareCopyFeedback] = useState("");
  const [showJoinedNotice, setShowJoinedNotice] = useState(false);
  const roomDeepLinkHandledRef = useRef(false);

  const [draftScoresByArtist, setDraftScoresByArtist] = useState<Record<string, { song: number; show: number }>>({});
  const voteSnapshotRef = useRef<Map<string, string>>(new Map());
  const voteSnapshotInitializedRef = useRef(false);
  const pulseTimersRef = useRef<number[]>([]);
  const appVersionRef = useRef<string | null>(null);
  const currentVoterNameRef = useRef("");

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

  const applyState = useCallback((nextState: StateResponse) => {
    setArtists(nextState.artists);
    setVotes(nextState.votes);
    setLeaderboard(nextState.leaderboard);
    processIncomingVotes(nextState.votes, nextState.artists);
  }, [processIncomingVotes]);

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
  }

  async function createRoom() {
    setRoomActionLoading(true);
    setErrorMessage("");
    const response = await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create" }),
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
    setShowCreateRoom(false);
    setRoomCodeInUrl(payload.roomCode);
    localStorage.setItem(roomCodeStorageKey, payload.roomCode);
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
    setVotePulseItems([]);
    voteSnapshotRef.current = new Map();
    voteSnapshotInitializedRef.current = false;
    localStorage.removeItem(roomCodeStorageKey);
    localStorage.removeItem("mello-voter-name");
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
          <p className="mt-2 text-xs text-white/60">Live sync every 5s across all phones.</p>
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

        <VotePulseDock items={votePulseItems} active={activeTab === "vote"} onSelectArtist={scrollToArtistCard} />

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
            <MobileVoteDeck
              artists={artists}
              getDraftScore={getDraftScore}
              updateDraftScore={updateDraftScore}
              getSortedVotesForArtist={(artistId) => rankedVotesByArtist.get(artistId) ?? []}
              savingVoteForArtistId={savingVoteForArtistId}
              submitVote={submitVote}
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
                        <h2 className="text-xl font-extrabold">{artist.name}</h2>
                        {hasVoted ? (
                          <span className="rounded-full bg-emerald-300 px-2 py-1 text-sm font-bold text-black">Voted</span>
                        ) : (
                          <span className="rounded-full bg-white/20 px-2 py-1 text-sm font-semibold text-white/80">Not voted</span>
                        )}
                      </div>

                      {artist.song ? <p className="mb-3 text-base from-fuchsia-300">♪ {artist.song}</p> : null}

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
                {everyoneHasVoted ? "See results 🏆" : "Leaderboard"}
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/20 bg-black/40 p-3 shadow-xl backdrop-blur md:p-4">
            <div className="mb-3 flex items-end justify-between gap-2">
              <h2 className="text-2xl font-black uppercase tracking-wide md:text-3xl">Leaderboard</h2>
              <p className="text-sm font-semibold uppercase tracking-wider text-white/65">{leaderboard.length} artists</p>
            </div>

            <div className="space-y-2 md:hidden">
              {leaderboard.map((row, index) => {
                const yourVote = votesByCurrentUserAndArtist.get(row.artistId);
                const stats = voteStatsByArtist.get(row.artistId);
                return (
                  <div key={row.artistId} className="rounded-xl border border-white/15 bg-black/35 px-3 py-2.5">
                    <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
                      <span className="text-right text-lg font-black tabular-nums text-white/85">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-white">{row.artistName}</p>
                        {row.songTitle ? <p className="truncate text-sm text-white/65">♪ {row.songTitle}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Total</p>
                        <p className="text-lg font-black tabular-nums text-white">{row.totalAverage.toFixed(1)}</p>
                      </div>
                    </div>

                    <div className="mt-2 rounded-md border border-white/10 bg-black/25 px-2 py-1.5">
                      <div className="grid grid-cols-[3rem_3rem_3rem_1fr_3.8rem] gap-1 text-xs font-semibold uppercase tracking-wide text-white/60">
                        <span className="text-right">Votes</span>
                        <span className="text-right">Song</span>
                        <span className="text-right">Show</span>
                        <span className="text-right">High/Low</span>
                        <span className="text-right">You</span>
                      </div>
                      <div className="mt-0.5 grid grid-cols-[3rem_3rem_3rem_1fr_3.8rem] gap-1 text-sm">
                        <span className="text-right font-bold tabular-nums text-white/90">{row.voteCount}</span>
                        <span className="text-right font-bold tabular-nums text-white/90">{row.songAverage.toFixed(1)}</span>
                        <span className="text-right font-bold tabular-nums text-white/90">{row.showAverage.toFixed(1)}</span>
                        <span className="text-right text-xs leading-tight">
                          <span className="block truncate font-semibold tabular-nums text-emerald-200/95">
                            H {stats?.highest ? `${stats.highest.voter.slice(0, 8)} ${stats.highest.total}` : "—"}
                          </span>
                          <span className="block truncate font-semibold tabular-nums text-rose-200/95">
                            L {stats?.lowest ? `${stats.lowest.voter.slice(0, 8)} ${stats.lowest.total}` : "—"}
                          </span>
                        </span>
                        <span className="text-right font-bold tabular-nums text-cyan-200">{yourVote ? `${yourVote.total}/24` : "—"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-white/15 bg-black/35 md:block">
              <div className="min-w-[840px]">
                <div className="grid grid-cols-[2.5rem_1fr_4rem_4rem_4rem_4rem_6.75rem_6.75rem_5rem] gap-2 border-b border-white/15 bg-black/45 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/70">
                  <span className="text-right">#</span>
                  <span>Artist</span>
                  <span className="text-right">Votes</span>
                  <span className="text-right">Song</span>
                  <span className="text-right">Show</span>
                  <span className="text-right">Total</span>
                  <span className="text-right">Lowest</span>
                  <span className="text-right">Highest</span>
                  <span className="text-right">You</span>
                </div>

                <div className="divide-y divide-white/10">
                  {leaderboard.map((row, index) => {
                    const yourVote = votesByCurrentUserAndArtist.get(row.artistId);
                    const stats = voteStatsByArtist.get(row.artistId);
                    const lowestLabel = stats?.lowest ? `${stats.lowest.voter.slice(0, 8)} ${stats.lowest.total}` : "—";
                    const highestLabel = stats?.highest ? `${stats.highest.voter.slice(0, 8)} ${stats.highest.total}` : "—";

                    return (
                      <div key={row.artistId} className="grid grid-cols-[2.5rem_1fr_4rem_4rem_4rem_4rem_6.75rem_6.75rem_5rem] items-center gap-2 px-3 py-2 text-base">
                        <span className="text-right font-black tabular-nums text-white/85">{index + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-white">{row.artistName}</p>
                          {row.songTitle ? <p className="truncate text-sm text-white/65">♪ {row.songTitle}</p> : null}
                        </div>
                        <span className="text-right font-semibold tabular-nums text-white/80">{row.voteCount}</span>
                        <span className="text-right font-semibold tabular-nums text-white/85">{row.songAverage.toFixed(1)}</span>
                        <span className="text-right font-semibold tabular-nums text-white/85">{row.showAverage.toFixed(1)}</span>
                        <span className="text-right font-black tabular-nums text-white">{row.totalAverage.toFixed(1)}</span>
                        <span className="text-right text-sm font-semibold tabular-nums text-rose-200/95">{lowestLabel}</span>
                        <span className="text-right text-sm font-semibold tabular-nums text-emerald-200/95">{highestLabel}</span>
                        <span className="text-right font-bold tabular-nums text-cyan-200">{yourVote ? `${yourVote.total}/24` : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-4 text-center">
              <button onClick={() => refreshState().catch(() => setErrorMessage("Refresh failed"))} className="text-sm text-white/50 underline hover:text-white/80">
                Refresh now
              </button>
            </div>
          </section>
        )}
      </div>

      {activeRoomCode && joinedName ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-black/45 p-2 backdrop-blur-md md:hidden" aria-label="Footer navigation">
          <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
            <button
              onClick={() => switchTab("vote")}
              role="tab"
              aria-selected={activeTab === "vote"}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                activeTab === "vote" ? "border border-white/35 bg-white/20 text-white" : "bg-white/10 text-white/85"
              }`}
            >
              Voting
            </button>
            <button
              onClick={() => switchTab("board")}
              role="tab"
              aria-selected={activeTab === "board"}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                activeTab === "board" ? "border border-white/35 bg-white/20 text-white" : "bg-white/10 text-white/85"
              }`}
            >
              Leaderboard
            </button>
            <Link
              href="/live-results"
              role="tab"
              className="rounded-xl bg-white/10 px-3 py-2 text-center text-sm font-bold text-white/85 transition hover:bg-white/20"
            >
              Live Results
            </Link>
          </div>
        </nav>
      ) : null}
    </main>
  );
}
