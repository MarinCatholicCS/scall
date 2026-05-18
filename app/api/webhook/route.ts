import { NextResponse, type NextRequest } from "next/server";
import { classifyEmail } from "@/lib/classify";
import { triggerCall, isCallableNumber } from "@/lib/agentphone";
import { sendConfirmation } from "@/lib/agentmail";

interface AgentMailMessage {
  message_id: string;
  inbox_id: string;
  thread_id: string;
  from_: string | string[];
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

interface AgentMailWebhookPayload {
  event_type: string;
  message: AgentMailMessage;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const payload = (await req.json().catch(() => null)) as AgentMailWebhookPayload | null;

  if (payload?.event_type !== "message.received") {
    return NextResponse.json({ skipped: "irrelevant_event" }, { status: 200 });
  }

  const message = payload?.message;
  if (!message) {
    return NextResponse.json({ skipped: "missing_message" }, { status: 200 });
  }

  const fromRaw = Array.isArray(message.from_) ? message.from_[0] : message.from_;
  const emailMatch = fromRaw?.match(/<([^>]+)>/);
  const from = emailMatch ? emailMatch[1] : (fromRaw ?? "");

  const subject = message.subject ?? "";

  // Loop protection: ignore emails from our own domain or our own confirmation emails
  if (from.includes("agentmail.to") || subject.includes("[Scall]")) {
    return NextResponse.json({ skipped: "loop_guard" }, { status: 200 });
  }
  const body = message.text ?? (message.html ? stripHtml(message.html) : "");

  if (!subject && !body) {
    return NextResponse.json({ skipped: "empty_email" }, { status: 200 });
  }

  let result;
  try {
    result = await classifyEmail(subject, body);
  } catch (err) {
    console.error("Classification error:", err);
    // Return 200 so AgentMail doesn't retry and double-call the scammer
    return NextResponse.json({ error: "Classification failed" }, { status: 200 });
  }

  if (!result.is_scam || !result.phone_number) {
    return NextResponse.json({ skipped: "not_scam_or_no_phone" }, { status: 200 });
  }

  if (!isCallableNumber(result.phone_number)) {
    console.warn("[webhook] rejected non-callable number:", result.phone_number);
    return NextResponse.json(
      { skipped: "non_callable_number", phone_number: result.phone_number },
      { status: 200 }
    );
  }

  const [callResult, emailResult] = await Promise.allSettled([
    triggerCall(result.phone_number),
    sendConfirmation(from, result.scam_type, result.phone_number),
  ]);

  if (callResult.status === "rejected") {
    console.error("AgentPhone error:", callResult.reason);
  }
  if (emailResult.status === "rejected") {
    console.error("AgentMail error:", emailResult.reason);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
