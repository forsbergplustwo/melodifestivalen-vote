"use client";

import { useState, useCallback } from "react";

export default function FeliciaMode() {
  const [showLaserShow, setShowLaserShow] = useState(false);

  const triggerLaserShow = useCallback((durationMs = 8400) => {
    setShowLaserShow(true);
    setTimeout(() => setShowLaserShow(false), durationMs);
  }, []);

  return (
    <>
      <button
        onClick={() => triggerLaserShow()}
        className="fixed bottom-3 right-3 z-[55] rounded-full border border-fuchsia-300/50 bg-fuchsia-950/80 px-4 py-2 text-sm font-black text-fuchsia-100 shadow-lg"
      >
        Felicia mode
      </button>

      {showLaserShow ? (
        <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden bg-black/80">
          <div className="laser laser--a" />
          <div className="laser laser--b" />
          <div className="laser laser--c" />
          <div className="laser laser--d" />
          <div className="laser laser--e" />
          <div className="laser laser--f" />
          <div className="laser laser--g" />
          <div className="laser laser--h" />
          <div className="laser laser--i" />
          <div className="laser laser--j" />
          <div className="laser-point laser-point--1" />
          <div className="laser-point laser-point--2" />
          <div className="laser-point laser-point--3" />
          <div className="laser-point laser-point--4" />
          <div className="laser-center">✨ FELICIA MODE ✨</div>
        </div>
      ) : null}
    </>
  );
}
