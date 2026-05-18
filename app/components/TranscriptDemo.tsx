"use client";

import { useEffect, useRef, useState } from "react";
import "./transcriptDemo.css";

interface Turn {
  role: "scammer" | "marge";
  text: string;
}

// Curated highlight reel — tight comedy, deterministic for demos.
const SCRIPT: Turn[] = [
  { role: "scammer", text: "Hi, this is Officer Davis with the IRS. You owe $3,200 in back taxes." },
  { role: "marge",   text: "Oh, the IRS? Or the FBI? Frank handled all this... where are my glasses?" },
  { role: "scammer", text: "Ma'am, this is serious. There's a warrant out for your arrest." },
  { role: "marge",   text: "A warrant? Oh dear. Did Frank know about this? He passed last spring." },
  { role: "scammer", text: "Listen. Go to CVS, buy six Apple gift cards, $500 each. Right now." },
  { role: "marge",   text: "Apple? Like the fruit? My granddaughter sent me a bird feeder once..." },
  { role: "scammer", text: "NO. Apple GIFT CARDS. For the iPhone. NOW." },
  { role: "marge",   text: "Oh, I have an iPhone! Well, Frank's iPhone. Hold on, the cat just—" },
  { role: "scammer", text: "*click*" },
];

const CHAR_MS = 25;          // per-character type speed
const TURN_PAUSE_MS = 700;   // pause between turns
const LOOP_HOLD_MS = 3500;   // pause at the end before looping
const RESTART_MS = 600;      // brief blank before restart

export default function TranscriptDemo() {
  const [turnIdx, setTurnIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect prefers-reduced-motion once on mount
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  // Drive the typewriter
  useEffect(() => {
    if (reducedMotion) return; // skip animation entirely

    const current = SCRIPT[turnIdx];
    if (!current) return;

    // Typing within current turn
    if (charIdx < current.text.length) {
      const t = setTimeout(() => setCharIdx((c) => c + 1), CHAR_MS);
      return () => clearTimeout(t);
    }

    // Finished current turn
    const isLastTurn = turnIdx === SCRIPT.length - 1;
    if (isLastTurn) {
      // Hold final state, then loop
      const t = setTimeout(() => {
        setTurnIdx(0);
        setCharIdx(0);
      }, LOOP_HOLD_MS + RESTART_MS);
      return () => clearTimeout(t);
    }

    // Advance to next turn
    const t = setTimeout(() => {
      setTurnIdx((i) => i + 1);
      setCharIdx(0);
    }, TURN_PAUSE_MS);
    return () => clearTimeout(t);
  }, [turnIdx, charIdx, reducedMotion]);

  // Auto-scroll to bottom as new turns appear
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turnIdx, charIdx]);

  // What to render
  const completedTurns = reducedMotion ? SCRIPT : SCRIPT.slice(0, turnIdx);
  const inProgressTurn = reducedMotion ? null : SCRIPT[turnIdx];
  const inProgressText = inProgressTurn ? inProgressTurn.text.slice(0, charIdx) : "";
  const isFinalDoneFrame =
    !reducedMotion &&
    turnIdx === SCRIPT.length - 1 &&
    charIdx >= SCRIPT[SCRIPT.length - 1].text.length;

  return (
    <div className="td-window" aria-label="Sample scam call transcript">
      <div className="td-header">
        <span className="td-header-left">📞 CALL_LOG · +1-415-849-8764</span>
        <span className="td-header-right">2m 14s wasted</span>
      </div>
      <div className="td-body" ref={containerRef}>
        {completedTurns.map((t, i) => (
          <TurnRow key={`done-${i}`} turn={t} text={t.text} cursor={false} />
        ))}
        {inProgressTurn && (
          <TurnRow
            key={`live-${turnIdx}`}
            turn={inProgressTurn}
            text={inProgressText}
            cursor={!isFinalDoneFrame}
          />
        )}
      </div>
    </div>
  );
}

function TurnRow({
  turn,
  text,
  cursor,
}: {
  turn: Turn;
  text: string;
  cursor: boolean;
}) {
  return (
    <div className={`td-row td-row-${turn.role}`}>
      <span className={`td-chip td-chip-${turn.role}`}>
        {turn.role === "scammer" ? "SCAMMER" : "SCALL"}
      </span>
      <span className="td-text">
        {text}
        {cursor && <span className="td-cursor" aria-hidden>▍</span>}
      </span>
    </div>
  );
}
