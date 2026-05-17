"use client";

import { useEffect, useMemo, useState } from "react";
import "./dashboard.css";

interface Record {
  id: string;
  created_at: string;
  call_id: string | null;
  phone_number: string;
  duration_seconds: number | null;
  impersonation_target: string | null;
  money_amount: number | null;
  money_amount_text: string | null;
  payment_method: string | null;
  notes: string | null;
}

function digitsOnly(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D+/g, "");
}

function formatPhone(num: string): { prefix: string; body: string } | string {
  if (!num) return "";
  const m = String(num).match(/^\+?(\d)(\d{3})(\d{3})(\d{4})$/);
  if (!m) return num;
  return { prefix: `+${m[1]}`, body: `${m[2]} ${m[3]} ${m[4]}` };
}

function formatDuration(s: number | null): string {
  if (s == null) return "— wasted";
  const sec = Math.round(s);
  if (sec < 60) return `${sec}s wasted`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r === 0 ? `${m}m wasted` : `${m}m ${r}s wasted`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function filterRecords(records: Record[], query: string): Record[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  const qDigits = digitsOnly(q);
  return records.filter((r) => {
    const haystack = [
      r.phone_number,
      r.impersonation_target,
      r.payment_method,
      r.notes,
      r.money_amount_text,
      r.money_amount != null ? String(r.money_amount) : "",
    ]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(q)) return true;
    if (qDigits.length >= 3 && digitsOnly(r.phone_number).includes(qDigits)) return true;
    return false;
  });
}

function PhoneDisplay({ num }: { num: string }) {
  const p = formatPhone(num);
  if (typeof p === "string") return <>{p}</>;
  return (
    <>
      <span className="phone-prefix">{p.prefix}</span>
      {p.body}
    </>
  );
}

function Card({ r }: { r: Record }) {
  return (
    <article className="card">
      <div className="card-top">
        <span className="ts">{formatTimestamp(r.created_at)}</span>
        <span className="dur">{formatDuration(r.duration_seconds)}</span>
      </div>
      <div className="phone-num">
        <PhoneDisplay num={r.phone_number} />
      </div>
      <div className="chips">
        {r.impersonation_target && (
          <span className="chip chip-target">{r.impersonation_target}</span>
        )}
        {r.payment_method && (
          <span className="chip chip-payment">{r.payment_method}</span>
        )}
      </div>
      <div className={`amount ${r.money_amount == null ? "amount-empty" : ""}`}>
        <span className="label">target</span>
        <span className="value">
          {r.money_amount != null && !isNaN(r.money_amount)
            ? `$${Number(r.money_amount).toLocaleString("en-US")}`
            : "—"}
        </span>
      </div>
      {r.notes && <div className="notes-body">{r.notes}</div>}
    </article>
  );
}

export default function AddressesPage() {
  const [records, setRecords] = useState<Record[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  // Hydrate ?q=... from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setQuery(q);
  }, []);

  useEffect(() => {
    fetch("/api/calls")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Record[]) => setRecords(data))
      .catch(() => setError(true));
  }, []);

  const filtered = useMemo(
    () => (records ? filterRecords(records, query) : []),
    [records, query]
  );

  const total = records?.length ?? 0;
  const isFiltered = !!query.trim();

  const metaText = error
    ? "error"
    : records == null
    ? "loading…"
    : isFiltered
    ? `${filtered.length} of ${total} ${total === 1 ? "record" : "records"}`
    : `${total} ${total === 1 ? "record" : "records"}`;

  return (
    <>
      <div className="header">
        <pre className="ascii-small">
{` ██████╗  ██████╗ █████╗ ██╗     ██╗
██╔════╝ ██╔════╝██╔══██╗██║     ██║
╚█████╗  ██║     ███████║██║     ██║
 ╚═══██╗ ██║     ██╔══██║██║     ██║
██████╔╝ ╚██████╗██║  ██║███████╗███████╗
╚═════╝   ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝`}
        </pre>
        <pre
          style={{
            position: "absolute",
            marginLeft: "17.5%",
            top: 48,
            color: "orange",
            fontSize: 5,
          }}
        >
{`
                ▄▄ ▄▄                                            ▄▄ ▄▄
       █▄       ██ ██                                            ██ ██
      ▄██▄      ██ ██                     ▄                      ██ ██
 ▄██▀█ ██ ▄▀▀█▄ ██ ██   ▄██▀█ ▄███▀ ▄▀▀█▄ ███▄███▄   ▄███▀ ▄▀▀█▄ ██ ██ ▄██▀█
 ▀███▄ ██ ▄█▀██ ██ ██   ▀███▄ ██    ▄█▀██ ██ ██ ██   ██    ▄█▀██ ██ ██ ▀███▄
█▄▄██▀▄██▄▀█▄██▄██▄██  █▄▄██▀▄▀███▄▄▀█▄██▄██ ██ ▀█  ▄▀███▄▄▀█▄██▄██▄███▄▄██▀
`}
        </pre>
        <a href="/" className="back-link">← Back to home</a>
      </div>

      <div className="page-title">
        <h1>// captured_addresses.db</h1>
        <span className="meta">{metaText}</span>
      </div>

      <div className={`search-wrap ${query ? "has-query" : ""}`}>
        <span className="search-prompt">&gt;</span>
        <input
          className="search-input"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="search by phone, impersonator, payment, or keyword…"
          aria-label="Search captured records"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="search-clear"
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            [clear]
          </button>
        )}
      </div>

      <div className="cards">
        {error ? (
          <div className="empty">failed to load addresses ─ check /api/calls</div>
        ) : records == null ? (
          <div className="empty">
            loading<span className="blink">_</span>
          </div>
        ) : total === 0 ? (
          <div className="empty">
            no calls captured yet<span className="blink">_</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            no matches for &quot;{query}&quot;<span className="blink">_</span>
          </div>
        ) : (
          filtered.map((r) => <Card key={r.id} r={r} />)
        )}
      </div>
    </>
  );
}
