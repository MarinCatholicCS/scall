// Post-call analysis. Reads a scam-call transcript and extracts structured
// fields (impersonation target, money amount, payment method, notes) using
// Gemini's JSON-schema mode.

export interface TranscriptTurn {
  role: string;
  content: string;
}

export interface SummaryResult {
  impersonation_target: string;
  money_amount: number | null;
  money_amount_text: string | null;
  payment_method: string | null;
  notes: string;
}

const GEMINI_MODELS = [
  process.env.GEMINI_SUMMARIZE_MODEL,
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
].filter(Boolean) as string[];

const SUMMARIZE_TIMEOUT_MS = 15000;

const SYSTEM_PROMPT = `You analyze transcripts of scam phone calls. In each transcript, the "user" role is the scammer calling in; the "agent" role is OUR stalling AI that pretends to be a confused elderly person. Extract structured information about what the scammer was trying to do.

Return JSON with these fields:

- impersonation_target: who the scammer claimed to represent (e.g. "IRS", "Amazon", "Microsoft Tech Support", "FBI", "Social Security Administration", "your grandson"). Empty string if unclear.
- money_amount: a single number representing the dollar amount they tried to extract, or null if no specific amount was mentioned. Convert words ("ten thousand") to numbers (10000).
- money_amount_text: the original phrasing they used (e.g. "$3,200", "ten thousand dollars"), or null.
- payment_method: how they wanted to be paid (e.g. "gift card", "wire transfer", "Bitcoin", "Zelle"). Null if not specified.
- notes: a 1-3 sentence summary of the scam, focused on their tactics, urgency, and red flags. Plain prose, no bullets.

Only extract what the scammer (user role) actually said. Do NOT infer or invent details. Ignore anything the agent (our AI) said when extracting facts about the scam.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    impersonation_target: { type: "STRING" },
    money_amount: { type: "NUMBER", nullable: true },
    money_amount_text: { type: "STRING", nullable: true },
    payment_method: { type: "STRING", nullable: true },
    notes: { type: "STRING" },
  },
  required: ["impersonation_target", "money_amount", "money_amount_text", "payment_method", "notes"],
};

function formatTranscript(turns: TranscriptTurn[]): string {
  return turns
    .map(t => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n");
}

export async function summarizeTranscript(
  transcript: TranscriptTurn[]
): Promise<SummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const userContent = `TRANSCRIPT:\n\n${formatTranscript(transcript)}`;
  const reqBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 600,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let lastError: Error | null = null;

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUMMARIZE_TIMEOUT_MS);

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
        console.warn(`[summarize] model ${model} unavailable (HTTP ${r.status}), trying next…`);
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
        throw new Error(`Gemini ${model} returned no text`);
      }

      const parsed = JSON.parse(text) as SummaryResult;
      console.log(`[summarize] used model: ${model}`);
      return parsed;
    } catch (e) {
      clearTimeout(timer);
      const err = e as Error;
      console.warn(`[summarize] ${model} error:`, err.message);
      lastError = err;
    }
  }

  throw lastError ?? new Error("All Gemini summarize models failed");
}
