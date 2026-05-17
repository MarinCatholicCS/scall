import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  classifyTurns,
  generateStallLine,
  pick,
  OPENERS,
  NORMAL_REPLIES,
  CAUTION_REPLIES,
  STALL_FALLBACK,
} from "../lib/gemini";

// AgentPhone fires this endpoint for every conversation turn.
// We return { text, say, message } with the next thing the agent should say.
// This handler is stateless — all context is derived from body.recentHistory.

interface HistoryEntry {
  role: "user" | "agent";
  content: string;
}

interface AgentPhoneWebhookBody {
  event?: string;
  data?: {
    transcript?: string | Array<{ role: string; content: string }>;
    message?: string;
    callId?: string;
    conversationId?: string;
    from?: string;
    durationSeconds?: number;
    disconnectionReason?: string;
  };
  text?: string;
  recentHistory?: HistoryEntry[];
}

const FRUSTRATION_RE = /\b(end this call|hang up|are you (there|listening|deaf)|why aren'?t you|stop (saying|asking)|i'?m (gonna|going to) (hang|end|leave))\b/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const start = Date.now();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as AgentPhoneWebhookBody;
  const d = body.data ?? {};
  const event = body.event ?? "";

  console.log("\n==============================");
  console.log("📞 converse webhook:", event || "(no event)");

  // Call ended — acknowledge only, no reply needed.
  if (event === "agent.call_ended") {
    console.log("🔴 call ended:", {
      callId: d.callId,
      durationSeconds: d.durationSeconds,
      disconnectionReason: d.disconnectionReason,
    });
    console.log("==============================\n");
    return res.json({ ok: true });
  }

  // ---- Extract conversation history from recentHistory ----
  const history: HistoryEntry[] = Array.isArray(body.recentHistory) ? body.recentHistory : [];
  const userTurns = history.filter(h => h.role === "user").map(h => h.content);
  const agentTurns = history.filter(h => h.role === "agent").map(h => h.content);
  const turnCount = userTurns.length;
  const stallIndex = agentTurns.length;

  // ---- Extract current utterance ----
  let utterance = "";
  let utteranceSource = "none";

  if (typeof d.transcript === "string" && d.transcript.trim()) {
    utterance = d.transcript.trim();
    utteranceSource = "data.transcript (voice)";
  } else if (typeof d.message === "string" && d.message.trim()) {
    utterance = d.message.trim();
    utteranceSource = "data.message (sms)";
  } else if (typeof body.text === "string" && body.text.trim()) {
    utterance = body.text.trim();
    utteranceSource = "body.text (legacy)";
  } else if (Array.isArray(d.transcript)) {
    const lastUser = [...d.transcript].reverse().find(t => t.role === "user");
    if (lastUser?.content) {
      utterance = lastUser.content.trim();
      utteranceSource = "data.transcript[] (array)";
    }
  }

  // Fallback: grab last user turn from recentHistory if utterance still empty
  if (!utterance && userTurns.length > 0) {
    utterance = userTurns[userTurns.length - 1];
    utteranceSource = "recentHistory[last user] (fallback)";
  }

  console.log("🧠 utterance:", utterance ? `"${utterance}"` : "(empty)");
  console.log("📥 source:", utteranceSource);
  if (userTurns.length) console.log("📜 history user turns:", userTurns.length);

  // ---- No utterance ----
  if (!utterance) {
    const reply = turnCount === 0
      ? pick(OPENERS, 0)
      : "Hello? Are you still there?";
    console.log("👋", turnCount === 0 ? "[OPENER]" : "[EMPTY TURN]", reply);
    console.log("⏱️", Date.now() - start, "ms\n==============================\n");
    return res.json({ text: reply, say: reply, message: reply });
  }

  // ---- Classify ----
  // Recompute from full history + current utterance (stateless-safe).
  const { signals, riskScore, mode } = classifyTurns([...userTurns, utterance]);
  const frustration = FRUSTRATION_RE.test(utterance);
  if (frustration) console.log("😤 caller frustration detected");

  // ---- Generate reply ----
  let reply: string | undefined;
  let source = "hardcoded";

  const useGemini = (mode === "stall" || mode === "caution" || frustration) && !!process.env.GEMINI_API_KEY;

  if (useGemini) {
    const generated = await generateStallLine({
      utterance,
      history: userTurns.slice(0, -1), // exclude current utterance (already in the prompt)
      agentHistory: agentTurns.slice(-3),
      signals,
      frustration,
    });
    if (generated) {
      reply = generated;
      source = "gemini";
    }
  }

  if (!reply) {
    if (mode === "stall") {
      reply = pick(STALL_FALLBACK, stallIndex);
    } else if (mode === "caution") {
      reply = pick(CAUTION_REPLIES, turnCount);
    } else {
      reply = pick(NORMAL_REPLIES, turnCount);
    }
  }

  console.log("📊", { risk: riskScore, mode, signals, frustration });
  console.log(`💬 reply (${source}):`, reply);
  console.log("⏱️", Date.now() - start, "ms\n==============================\n");

  return res.json({ text: reply, say: reply, message: reply });
}
