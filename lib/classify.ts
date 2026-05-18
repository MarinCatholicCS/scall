// Classifies a forwarded email as scam-or-not using Gemini (gemini-2.5-flash).
// Uses Gemini's native JSON mode via responseMimeType + responseSchema so
// the output is guaranteed-parseable structured data.

export interface ClassifyResult {
  is_scam: boolean;
  confidence: number;
  phone_number: string | null;
  scam_type: string;
  reasoning: string;
}

// Try newest first, fall back to stable. Only known-good model names listed
// here (we verified gemini-3.1-flash and gemini-3.0-flash 404 in this region).
const GEMINI_MODELS = [
  process.env.GEMINI_CLASSIFY_MODEL,
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
].filter(Boolean) as string[];

const CLASSIFY_TIMEOUT_MS = 15000;

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

Return ONLY the JSON. Do not call if there is no usable phone number — set phone_number to null in that case.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_scam: { type: "BOOLEAN" },
    confidence: { type: "NUMBER" },
    phone_number: { type: "STRING", nullable: true },
    scam_type: { type: "STRING" },
    reasoning: { type: "STRING" },
  },
  required: ["is_scam", "confidence", "phone_number", "scam_type", "reasoning"],
};

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const userContent = `Subject: ${subject}\n\n${body}`;
  const reqBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let lastError: Error | null = null;

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (r.status === 404 || r.status === 400) {
        const errText = await r.text().catch(() => "");
        console.warn(`[classify] model ${model} unavailable (HTTP ${r.status}), trying next…`);
        if (errText) console.warn("   detail:", errText.slice(0, 300));
        lastError = new Error(`Gemini ${model} HTTP ${r.status}`);
        continue;
      }
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        throw new Error(`Gemini ${model} HTTP ${r.status}: ${errText.slice(0, 300)}`);
      }

      const json = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error(`Gemini ${model} returned no text: ${JSON.stringify(json).slice(0, 300)}`);
      }

      const parsed = JSON.parse(text) as ClassifyResult;
      parsed.phone_number = normalizePhone(parsed.phone_number);
      console.log(`[classify] used model: ${model}`);
      return parsed;
    } catch (e) {
      clearTimeout(timer);
      const err = e as Error;
      console.warn(`[classify] ${model} error:`, err.message);
      lastError = err;
    }
  }

  throw lastError ?? new Error("All Gemini classify models failed");
}
