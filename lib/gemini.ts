// Scam signal classifier + Gemini REST client for turn-by-turn stall line generation.

// ------------------------------------------------------------
// Scam signal classifier
// ------------------------------------------------------------

const RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "urgency",                 pattern: /\b(urgent(ly)?|immediately|right (now|away)|act now|final notice|last chance|before it'?s too late|expires? (today|soon))\b/i },
  { label: "authority_impersonation", pattern: /\b(irs|fbi|police|sheriff|social security( administration)?|ssa|medicare|amazon|apple( support| security)?|microsoft|geek squad|bank of america|wells fargo|chase( fraud)?|paypal|fedex|usps|ups|customs|immigration|ice agent)\b/i },
  { label: "payment_request",         pattern: /\b(gift cards?|google play|apple cards?|bitcoin|btc|crypto(currency)?|wire transfers?|zelle|venmo|cash app|western union|moneygram|prepaid cards?|owe|outstanding (debt|balance|payment)|pay (back|now|today|the (fee|fine|debt))|refund|reimburse|invoice)\b/i },
  { label: "money_amount",            pattern: /(\$\s?\d|\d+\s?(hundred|thousand|million|billion|trillion|quadrillion)?\s*dollars?\b|\bdollars?\b.*\b(owe|owed|debt|pay)\b|\b(owe|owed|debt|pay)\b.*\bdollars?\b|\b(hundred|thousand|million|billion|trillion|quadrillion)\s+dollars?\b)/i },
  { label: "account_issue",           pattern: /\b(suspend(ed)?|lock(ed)?|compromis(ed|ing)|fraud alert|unauthorized (charge|purchase|transaction|access)|breach(ed)?|hack(ed)?)\b/i },
  { label: "personal_info_request",   pattern: /\b(social security (number|#)|ssn|date of birth|dob|card number|cvv|cvc|password|one[- ]time (code|password)|otp|verification code|security code|pin)\b/i },
  { label: "remote_access",           pattern: /\b(team ?viewer|any ?desk|log ?me ?in|remote (access|control|session|connection)|install (this|the) (app|software)|download (this|the) (app|software))\b/i },
  { label: "threat",                  pattern: /\b(arrest(ed)?|warrant|lawsuit|sue you|deport(ation)?|lawyer|attorney|court|jail|prison|criminal charges?)\b/i },
];

const WEIGHTS: Record<string, number> = {
  urgency: 15, authority_impersonation: 35, payment_request: 40,
  money_amount: 30, account_issue: 25, personal_info_request: 35,
  remote_access: 50, threat: 40,
};

export type CallMode = "normal" | "caution" | "stall";

export interface ClassifyResult {
  signals: string[];
  riskScore: number;
  mode: CallMode;
}

export function classifyTurns(turns: string[]): ClassifyResult {
  const combined = turns.join(" ");
  const signals: string[] = [];
  for (const { label, pattern } of RULES) {
    if (pattern.test(combined)) signals.push(label);
  }
  const riskScore = Math.min(100, signals.reduce((s, sig) => s + (WEIGHTS[sig] ?? 10), 0));
  const mode: CallMode = riskScore >= 50 ? "stall" : riskScore >= 25 ? "caution" : "normal";
  return { signals, riskScore, mode };
}

// ------------------------------------------------------------
// Hardcoded reply pools
// ------------------------------------------------------------

export const OPENERS = [
  "Hello, this is the residence — who's calling?",
];

export const NORMAL_REPLIES = [
  "Who is this, sorry?",
  "What's this about?",
  "I didn't catch who you said you were with.",
  "Sorry, can you say that again?",
];

export const CAUTION_REPLIES = [
  "Hmm, can you repeat that?",
  "Sorry, what was that?",
  "Wait, who did you say you were with?",
  "One sec — can you say that one more time?",
  "I didn't quite catch that, can you repeat?",
];

export const STALL_FALLBACK = [
  "Sorry — can you say that one more time?",
  "Hmm, what was your employee ID again?",
  "One sec, let me grab a pen.",
  "Can you spell your name for me?",
  "Wait — which company did you say you were with?",
  "Hold on, my glasses fell — give me a second.",
  "Uh, can you start over from the beginning?",
  "Sorry, the dog is barking — what did you say?",
  "Which department did you say you were with again?",
  "Let me find my reading glasses, hold on.",
  "Wait, what was the amount again?",
  "Sorry I'm a little hard of hearing, can you speak up?",
];

export function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

// ------------------------------------------------------------
// Gemini stall line generator
// ------------------------------------------------------------

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
].filter(Boolean) as string[];

const GEMINI_TIMEOUT_MS = 800;

const STALL_PROMPT = `You ARE an elderly person on the phone. Not playing one — you ARE one. Your job: keep this caller on the line by sounding like a real, lonely, slightly-confused grandma who's half-listening while doing something else.

Caller just said: "{utterance}"

What they said earlier in this call:
{history}

What YOU have already said (each new reply MUST be a different style than these):
{agent_history}

Scam signals: {signals}
Caller frustrated: {frustration}

HOW TO SOUND REAL (this is the hard part):
- Use natural speech: "uh", "well", "hmm", "oh", "let me see", "you know", "I'm sorry, what?", "goodness", "oh dear"
- Trail off, hesitate, restart sentences: "I was just— wait, what did you say?"
- Mix lengths. Some turns are short ("Oh, my."). Some are longer rambles. NEVER all the same length.
- 1-2 sentences. Roughly 8-25 words. NOT a 3-word telegram. NOT a paragraph.
- Reference a SPECIFIC thing they said (number, company, name), but slightly wrong or confused

VARIETY (look at what you already said above — do something DIFFERENT this turn):
Rotate through these reply types — do NOT do the same type twice in a row:
  1. Confused clarification: "Wait, ten thousand? On Amazon? I don't even have a computer."
  2. Personal tangent: "Oh my husband Frank used to handle the bills. He passed last spring."
  3. Tiny distraction: "Hold on, the kettle is whistling. One sec."
  4. Half-engagement: "Oh dear, that does sound serious. What was your name again?"
  5. Almost-cooperation that leads nowhere: "Okay let me find my glasses... where did I put... uh, what was the amount?"
  6. Mishearing: "Amazon? Did you say Amazon, like the river? My grandson watches shows about it."

BAD — do NOT do any of these:
- Two-word echoes ("Amazon warrant?") — sounds like a robot
- Repeating the same TYPE of reply as last turn
- Generic "can you repeat that" with no specifics
- Multiple unrelated topics jammed in one reply
- Giving real info, codes, addresses, payment confirmation
- Sounding scripted, polished, or alert

If they're frustrated: briefly seem to take them seriously, apologize ("Oh I'm so sorry, I'm a little slow today"), then drift again with a confused question.

Output ONLY the reply. No quotes. No labels. No "Reply:" prefix.`;

export interface GenerateStallLineOptions {
  utterance: string;
  history: string[];
  agentHistory: string[];
  signals: string[];
  frustration: boolean;
}

export async function generateStallLine(opts: GenerateStallLineOptions): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const { utterance, history, agentHistory, signals, frustration } = opts;
  const prompt = STALL_PROMPT
    .replace("{utterance}", utterance)
    .replace("{history}", history.length ? history.map(h => `- "${h}"`).join("\n") : "(none yet)")
    .replace("{agent_history}", agentHistory.length ? agentHistory.map(h => `- "${h}"`).join("\n") : "(nothing yet)")
    .replace("{signals}", signals.join(", ") || "(none — but suspicious)")
    .replace("{frustration}", frustration ? "YES — they're losing patience, switch tactics" : "no");

  const reqBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 80,
      topP: 0.95,
    },
  };

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

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
        console.warn(`[gemini] model ${model} unavailable (HTTP ${r.status}), trying next…`);
        if (errText) console.warn("   detail:", errText.slice(0, 200));
        continue;
      }
      if (!r.ok) {
        console.warn(`[gemini] HTTP ${r.status} on ${model}:`, await r.text().catch(() => ""));
        return null;
      }

      const json = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        console.warn(`[gemini] ${model} returned no text`);
        return null;
      }
      // Soft trim: take up to first 2 sentences, cap at ~30 words.
      // Avoids over-clamping that produces robotic 2-word telegrams.
      let cleaned = text.replace(/^["']|["']$/g, "").trim();
      const twoSentences = cleaned.match(/^([^.!?]*[.!?]\s*){1,2}/);
      if (twoSentences) cleaned = twoSentences[0].trim();
      const words = cleaned.split(/\s+/);
      if (words.length > 30) cleaned = words.slice(0, 30).join(" ");
      if (cleaned.length > 250) {
        console.warn(`[gemini] ${model} reply too long (${cleaned.length} chars), falling back`);
        return null;
      }
      console.log(`[gemini] used model: ${model}`);
      return cleaned;
    } catch (e) {
      clearTimeout(timer);
      const err = e as Error;
      if (err.name === "AbortError") {
        console.warn(`[gemini] ${model} timed out after ${GEMINI_TIMEOUT_MS}ms`);
      } else {
        console.warn(`[gemini] ${model} error:`, err.message);
      }
      return null;
    }
  }

  console.warn("[gemini] all models failed, using hardcoded fallback");
  return null;
}
