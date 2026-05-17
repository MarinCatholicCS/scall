import type { VercelRequest, VercelResponse } from "@vercel/node";
import { classifyEmail } from "../lib/classify";
import { triggerCall } from "../lib/agentphone";
import { sendConfirmation } from "../lib/agentmail";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = req.body as AgentMailWebhookPayload;

  if (payload?.event_type !== "message.received") {
    return res.status(200).json({ skipped: "irrelevant_event" });
  }

  const message = payload?.message;

  if (!message) {
    return res.status(200).json({ skipped: "missing_message" });
  }

  const fromRaw = Array.isArray(message.from_) ? message.from_[0] : message.from_;
  const emailMatch = fromRaw?.match(/<([^>]+)>/);
  const from = emailMatch ? emailMatch[1] : (fromRaw ?? "");

  const subject = message.subject ?? "";

  // Loop protection: ignore emails from our own domain or our own confirmation emails
  if (from.includes("agentmail.to") || subject.includes("[Scall]")) {
    return res.status(200).json({ skipped: "loop_guard" });
  }
  const body = message.text ?? (message.html ? stripHtml(message.html) : "");

  if (!subject && !body) {
    return res.status(200).json({ skipped: "empty_email" });
  }

  let result;
  try {
    result = await classifyEmail(subject, body);
  } catch (err) {
    console.error("Classification error:", err);
    // Return 200 so AgentMail doesn't retry and double-call the scammer
    return res.status(200).json({ error: "Classification failed" });
  }

  if (!result.is_scam || !result.phone_number) {
    return res.status(200).json({ skipped: "not_scam_or_no_phone" });
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

  return res.status(200).json({ success: true });
}
