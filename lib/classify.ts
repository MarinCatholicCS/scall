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

const SYSTEM_PROMPT = `You are a scam-detection assistant. Analyze the email subject and body and return a JSON object with exactly these fields:

- is_scam: boolean
- confidence: number between 0 and 1
- phone_number: string in E.164 format (e.g. "+12125551234") or null if no phone number is present
- scam_type: short string describing the scam type (e.g. "IRS impersonation", "tech support", "lottery", "grandparent", "romance", "Amazon order"), or empty string if not a scam
- reasoning: brief explanation of your decision

Classify as a scam if the email shows signs of social engineering, impersonation, urgency pressure, requests for money/gift cards/wire transfers, fake account/order alerts, or suspicious phone numbers to call. Only populate phone_number if there's a real callable phone number in the email that the scammer wants the victim to call back.`;

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
