"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import "./landing.css";

interface Stats {
  count: number;
  total_seconds: number;
  total_money: number;
}

function formatSeconds(s: number): string {
  const sec = Math.round(s);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${sec % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function useAnimatedNumber(target: number, durationMs: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setStats)
      .catch(() => setError(true));
  }, []);

  const scammers = useAnimatedNumber(stats?.count ?? 0, 1200);
  const seconds = useAnimatedNumber(stats?.total_seconds ?? 0, 1600);
  const money = useAnimatedNumber(stats?.total_money ?? 0, 1600);

  return (
    <>
      <div className="container">
        <pre className="ascii-art">
{` ██████╗  ██████╗ █████╗ ██╗     ██╗
██╔════╝ ██╔════╝██╔══██╗██║     ██║
╚█████╗  ██║     ███████║██║     ██║
 ╚═══██╗ ██║     ██╔══██║██║     ██║
██████╔╝ ╚██████╗██║  ██║███████╗███████╗
╚═════╝   ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝`}
        </pre>

        <h1 style={{ paddingBottom: 5, paddingTop: 5 }}>stall scam calls</h1>

        <p style={{ color: "orange", paddingBottom: 10 }}>forward an email to scall@agentmail.to</p>
        <p style={{ color: "orange" }}>or click the button below</p>
        <br />

        <div className="actions">
          <a href="mailto:scall@agentmail.to" className="nav-link">scam a scammer</a>
          <a href="/addresses" className="nav-link">view the addresses →</a>
        </div>

        <div className="stats" aria-live="polite">
          <div className="stat">
            <span className="num">
              {error ? "—" : Math.round(scammers).toLocaleString("en-US")}
            </span>
            <span className="label">scammers stalled</span>
          </div>
          <span className="stat-sep" aria-hidden>·</span>
          <div className="stat">
            <span className="num">{error ? "—" : formatSeconds(seconds)}</span>
            <span className="label">seconds wasted</span>
          </div>
          <span className="stat-sep" aria-hidden>·</span>
          <div className="stat">
            <span className="num">{error ? "—" : formatMoney(money)}</span>
            <span className="label">money shielded</span>
          </div>
        </div>
      </div>

      <pre id="animation-output" aria-hidden />

      <Script src="/animation.min.js" strategy="afterInteractive" />
      <Script src="/fire-init.js" strategy="afterInteractive" />
    </>
  );
}
