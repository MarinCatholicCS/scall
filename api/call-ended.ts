import type { VercelRequest, VercelResponse } from "@vercel/node";
import { summarizeTranscript, type TranscriptTurn } from "../lib/summarize";
import { insertScamCall } from "../lib/supabase";

// Receives AgentPhone's `agent.call_ended` webhook, summarizes the transcript
// with Gemini, and writes a row to Supabase for the partner dashboard.
//
// Always returns 200 (even on internal errors) so AgentPhone doesn't retry-loop.

interface CallEndedBody {
  event?: string;
  data?: {
    callId?: string;
    from?: string;
    to?: string;
    durationSeconds?: number;
    disconnectionReason?: string;
    transcript?: TranscriptTurn[] | string;
  };
}

const CALL_ENDED_EVENTS = new Set([
  "agent.call_ended",
  "call.ended",
  "call_ended",
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as CallEndedBody;
  const event = body.event ?? "";
  const d = body.data ?? {};

  console.log("\n==============================");
  console.log("📞 call-ended webhook:", event || "(no event)");
  console.log("Timestamp:", new Date().toISOString());
  console.log("🔍 body keys:", Object.keys(body));
  console.log("🔍 data keys:", Object.keys(d));
  console.log("🔍 FULL BODY:", JSON.stringify(body).slice(0, 2000));

  if (!CALL_ENDED_EVENTS.has(event)) {
    console.log("⏭️  ignored (not a call-ended event)");
    return res.status(200).json({ skipped: "irrelevant_event" });
  }

  const callId = d.callId ?? null;
  const phoneNumber = d.to ?? d.from ?? "";
  const durationSeconds = typeof d.durationSeconds === "number"
    ? Math.round(d.durationSeconds)
    : null;

  console.log("☎️  extracted phone:", phoneNumber, "| duration:", durationSeconds, "s | callId:", callId);

  if (!phoneNumber) {
    console.warn("⚠️  no phone number in payload, skipping insert");
    return res.status(200).json({ skipped: "no_phone_number" });
  }

  const transcript = Array.isArray(d.transcript) ? d.transcript : [];
  console.log("🧾 transcript turns:", transcript.length, "type:", typeof d.transcript);

  if (transcript.length === 0) {
    console.warn("⚠️  no transcript array in payload, skipping summary + insert");
    return res.status(200).json({ skipped: "no_transcript" });
  }

  try {
    console.log("🤖 calling summarize...");
    const summary = await summarizeTranscript(transcript);
    console.log("📋 summary:", JSON.stringify(summary));

    console.log("💾 calling supabase insert...");
    await insertScamCall({
      call_id: callId,
      phone_number: phoneNumber,
      duration_seconds: durationSeconds,
      impersonation_target: summary.impersonation_target || null,
      money_amount: summary.money_amount,
      money_amount_text: summary.money_amount_text,
      payment_method: summary.payment_method,
      notes: summary.notes,
      transcript,
    });

    console.log("✅ all done");
    console.log("==============================\n");
    return res.status(200).json({ success: true });
  } catch (err) {
    const e = err as Error;
    console.error("❌ call-ended handler error:", e.message);
    console.error("stack:", e.stack);
    console.log("==============================\n");
    return res.status(200).json({ error: "internal_error", message: e.message });
  }
}
