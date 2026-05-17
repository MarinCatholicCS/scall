// Triggers an outbound AgentPhone call. The agent's persona / systemPrompt
// is configured in the AgentPhone dashboard so it can be iterated without
// a redeploy. Do NOT pass `systemPrompt` here — it would override the
// dashboard version.
export async function triggerCall(phoneNumber: string): Promise<void> {
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
