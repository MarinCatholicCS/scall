// Numbers we refuse to dial — emergency lines, N11 short codes, toll-free,
// premium-rate, foreign emergency. Protects against abuse where someone
// emails us a fake "scammer is 911" report.
const BLOCKED_EXACT = new Set([
  // E.164 normalized variants
  "+1911", "+1211", "+1311", "+1411", "+1511", "+1611", "+1711", "+1811", "+1988",
  // Raw short codes (in case normalization missed them)
  "911", "112", "999", "000", "211", "311", "411", "511", "611", "711", "811", "988",
]);
const BLOCKED_PREFIXES = [
  // US toll-free
  "+1800", "+1833", "+1844", "+1855", "+1866", "+1877", "+1888",
  // US premium-rate (1-900)
  "+1900",
];

export function isCallableNumber(num: string | null | undefined): boolean {
  if (!num) return false;
  if (BLOCKED_EXACT.has(num)) return false;
  if (BLOCKED_PREFIXES.some((p) => num.startsWith(p))) return false;
  // Must look like an E.164 number with at least 10 digits.
  if (!/^\+\d{10,15}$/.test(num)) return false;
  return true;
}

// Triggers an outbound AgentPhone call. The agent's persona / systemPrompt
// is configured in the AgentPhone dashboard so it can be iterated without
// a redeploy. Do NOT pass `systemPrompt` here — it would override the
// dashboard version.
export async function triggerCall(phoneNumber: string): Promise<void> {
  if (!isCallableNumber(phoneNumber)) {
    throw new Error(`Refusing to dial blocked number: ${phoneNumber}`);
  }
  const res = await fetch("https://api.agentphone.ai/v1/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AGENTPHONE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agentId: process.env.AGENTPHONE_AGENT_ID,
      toNumber: phoneNumber,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AgentPhone error ${res.status}: ${text}`);
  }
}
