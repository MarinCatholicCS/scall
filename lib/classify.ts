// Classifies a forwarded email or user-typed scam report using OpenAI
// (gpt-4o-mini by default) with strict JSON schema mode so the output is
// guaranteed-parseable.

import OpenAI from "openai";

export interface ClassifyResult {
  is_scam: boolean;
  confidence: number;
  phone_number: string | null;
  scam_type: string;
  reasoning: string;
}

const MODEL = process.env.OPENAI_CLASSIFY_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT = `You are the scam-call-triage assistant for "Scall", a service that calls scammers to waste their time. Users send emails to scall@agentmail.to in TWO patterns:

  (A) FORWARDED SCAM — the email body IS the scam itself (e.g. forwarded IRS-impersonation email, fake Amazon order alert, gift-card phishing).
  (B) USER REPORT — a regular person typing in to report a scam number, e.g. "this number 415-488-3120 keeps calling me pretending to be the IRS" or "please call +1-555-555-1234, they tried to scam my grandma".

Your job: decide if Scall should call a number, and which one.

Set is_scam = true if EITHER:
  - the email looks like a forwarded scam (urgency, impersonation, money requests, fake alerts, gift cards, wire transfers, threats), OR
  - the user is reporting / describing a scammer and gives a phone number to call. Reports don't need to contain scam language themselves — "tried to scam me", "is a scammer", "scam call", "tech-support scam", "IRS scam", etc. are sufficient signals.

Set is_scam = false for:
  - newsletters, marketing, personal emails with no scam context
  - vague messages with no callable number
  - emails clearly addressed to a real person about non-scam topics

Populate phone_number (E.164, e.g. "+14154883120") with the SCAMMER'S number:
  - In a forwarded scam: the callback number the scammer wants the victim to dial
  - In a user report: the number the user identifies as the scammer
  - If multiple numbers appear, pick the one most clearly tied to the scammer

Other fields:
  - confidence: 0–1
  - scam_type: short descriptor ("IRS impersonation", "tech support", "lottery", "grandparent", "romance", "Amazon order", "unknown" if reported but type unclear) or "" if not a scam
  - reasoning: 1-2 sentence explanation

Return ONLY the JSON. If there is no usable phone number, set phone_number to null.`;

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 7) return `+${digits}`;
  return null;
}

export async function classifyEmail(
  subject: string,
  body: string
): Promise<ClassifyResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const client = new OpenAI({ apiKey });
  const userContent = `Subject: ${subject}\n\n${body}`;

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 512,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "scam_classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            is_scam: { type: "boolean" },
            confidence: { type: "number" },
            phone_number: { type: ["string", "null"] },
            scam_type: { type: "string" },
            reasoning: { type: "string" },
          },
          required: ["is_scam", "confidence", "phone_number", "scam_type", "reasoning"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(text) as ClassifyResult;
  parsed.phone_number = normalizePhone(parsed.phone_number);
  console.log(`[classify] used model: ${MODEL}`);
  return parsed;
}
