import { NextResponse, type NextRequest } from "next/server";
import { summarizeTranscript, type TranscriptTurn } from "@/lib/summarize";
import { insertScamCall } from "@/lib/supabase";

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
    direction?: "inbound" | "outbound";
    durationSeconds?: number;
    disconnectionReason?: string;
    transcript?: TranscriptTurn[] | string;
  };
}

const CALL_ENDED_EVENTS = new Set(["agent.call_ended", "call.ended", "call_ended"]);

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = ((await req.json().catch(() => ({}))) ?? {}) as CallEndedBody;
  const event = body.event ?? "";
  const d = body.data ?? {};

  console.log("\n==============================");
  console.log("📞 call-ended webhook:", event || "(no event)");
  console.log("Timestamp:", new Date().toISOString());

  if (!CALL_ENDED_EVENTS.has(event)) {
    console.log("⏭️  ignored (not a call-ended event)");
    return NextResponse.json({ skipped: "irrelevant_event" }, { status: 200 });
  }

  const callId = d.callId ?? null;
  // Scammer's number depends on direction:
  //   outbound (we dial scammer): scammer is `to`, we are `from`
  //   inbound  (scammer dials us): scammer is `from`, we are `to`
  // If direction is missing, fall back to the previous behavior (to → from).
  const direction = d.direction;
  const phoneNumber =
    direction === "inbound"
      ? (d.from ?? d.to ?? "")
      : (d.to ?? d.from ?? "");
  const durationSeconds =
    typeof d.durationSeconds === "number" ? Math.round(d.durationSeconds) : null;

  console.log(
    "☎️  phone:", phoneNumber,
    "| direction:", direction ?? "(unknown)",
    "| duration:", durationSeconds, "s",
    "| callId:", callId
  );

  if (!phoneNumber) {
    console.warn("⚠️  no phone number in payload, skipping insert");
    return NextResponse.json({ skipped: "no_phone_number" }, { status: 200 });
  }

  const transcript = Array.isArray(d.transcript) ? d.transcript : [];
  console.log("🧾 transcript turns:", transcript.length);

  if (transcript.length === 0) {
    console.warn("⚠️  no transcript array in payload, skipping summary + insert");
    return NextResponse.json({ skipped: "no_transcript" }, { status: 200 });
  }

  try {
    const summary = await summarizeTranscript(transcript);
    console.log("📋 summary:", JSON.stringify(summary));

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
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const e = err as Error;
    console.error("❌ call-ended handler error:", e.message);
    console.error("stack:", e.stack);
    console.log("==============================\n");
    return NextResponse.json({ error: "internal_error", message: e.message }, { status: 200 });
  }
}
