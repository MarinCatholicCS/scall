import type { VercelRequest, VercelResponse } from "@vercel/node";
import { classifyEmail } from "../lib/classify";
import { triggerCall } from "../lib/agentphone";
import { sendConfirmation } from "../lib/agentmail";

interface AgentMailMessage {
  message_id: string;
  inbox_id: string;
  thread_id: string;
  from_: string[];
  to: string[];
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
  const message = payload?.message;

  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  const from = message.from_?.[0] ?? "";

  // Loop protection: ignore emails originating from our own domain
  if (from.includes("agentmail.to")) {
    return res.status(200).json({ skipped: "loop_guard" });
  }

  const subject = message.subject ?? "";
  const body = message.text ?? (message.html ? stripHtml(message.html) : "");

  if (!subject && !body) {
    return res.status(200).json({ skipped: "empty_email" });
  }

  let result;
  try {
    result = await classifyEmail(subject, body);
  } catch (err) {
    console.error("Classification error:", err);
    return res.status(500).json({ error: "Classification failed" });
  }

  if (!result.is_scam || !result.phone_number) {
    return res.status(200).json({ skipped: "not_scam_or_no_phone" });
  }

  try {
    await Promise.all([
      triggerCall(result.phone_number, result.scam_type, result.reasoning),
      sendConfirmation(from, result.scam_type, result.phone_number),
    ]);
  } catch (err) {
    console.error("Downstream action error:", err);
    return res.status(500).json({ error: "Failed to trigger actions" });
  }

  return res.status(200).json({ success: true });
}
