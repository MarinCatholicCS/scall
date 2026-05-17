import OpenAI from "openai";

export interface ClassifyResult {
  is_scam: boolean;
  confidence: number;
  phone_number: string | null;
  scam_type: string;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a scam-detection assistant. Analyze the email subject and body provided by the user and return a JSON object with exactly these fields:

{
  "is_scam": boolean,
  "confidence": number between 0 and 1,
  "phone_number": string in E.164 format (e.g. "+12125551234") or null if no phone number found,
  "scam_type": string describing the type of scam (e.g. "IRS impersonation", "tech support", "lottery", "grandparent", "romance") or "" if not a scam,
  "reasoning": string briefly explaining your decision
}

Classify as a scam if the email shows signs of social engineering, impersonation, urgency pressure, requests for money/gift cards/wire transfers, or suspicious phone numbers to call. Only populate phone_number if there is a real callable phone number in the email that the scammer wants the victim to call back.`;

function normalizePhone(raw: string): string | null {
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
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Subject: ${subject}\n\n${body}` },
    ],
    max_tokens: 512,
  });

  const raw = JSON.parse(response.choices[0].message.content ?? "{}") as ClassifyResult;

  if (raw.phone_number) {
    raw.phone_number = normalizePhone(raw.phone_number);
  }

  return raw;
}
