// Post-call analysis. Reads a scam-call transcript and extracts structured
// fields (impersonation target, money amount, payment method, notes) using
// OpenAI (gpt-4o-mini by default) with strict JSON schema mode.

import OpenAI from "openai";

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

const MODEL = process.env.OPENAI_SUMMARIZE_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT = `You analyze transcripts of scam phone calls. In each transcript, the "user" role is the scammer calling in; the "agent" role is OUR stalling AI that pretends to be a confused elderly person. Extract structured information about what the scammer was trying to do.

Return JSON with these fields:

- impersonation_target: who the scammer claimed to represent (e.g. "IRS", "Amazon", "Microsoft Tech Support", "FBI", "Social Security Administration", "your grandson"). Empty string if unclear.
- money_amount: a single number representing the dollar amount they tried to extract, or null if no specific amount was mentioned. Convert words ("ten thousand") to numbers (10000).
- money_amount_text: the original phrasing they used (e.g. "$3,200", "ten thousand dollars"), or null.
- payment_method: how they wanted to be paid (e.g. "gift card", "wire transfer", "Bitcoin", "Zelle"). Null if not specified.
- notes: a 1-3 sentence summary of the scam, focused on their tactics, urgency, and red flags. Plain prose, no bullets.

Only extract what the scammer (user role) actually said. Do NOT infer or invent details. Ignore anything the agent (our AI) said when extracting facts about the scam.`;

function formatTranscript(turns: TranscriptTurn[]): string {
  return turns
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n");
}

export async function summarizeTranscript(
  transcript: TranscriptTurn[]
): Promise<SummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const client = new OpenAI({ apiKey });
  const userContent = `TRANSCRIPT:\n\n${formatTranscript(transcript)}`;

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 600,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "scam_call_summary",
        strict: true,
        schema: {
          type: "object",
          properties: {
            impersonation_target: { type: "string" },
            money_amount: { type: ["number", "null"] },
            money_amount_text: { type: ["string", "null"] },
            payment_method: { type: ["string", "null"] },
            notes: { type: "string" },
          },
          required: [
            "impersonation_target",
            "money_amount",
            "money_amount_text",
            "payment_method",
            "notes",
          ],
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
  const parsed = JSON.parse(text) as SummaryResult;
  console.log(`[summarize] used model: ${MODEL}`);
  return parsed;
}
