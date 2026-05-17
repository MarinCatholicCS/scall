export async function triggerCall(
  phoneNumber: string,
  scamType: string,
  reasoning: string
): Promise<void> {
  const res = await fetch("https://api.agentphone.ai/v1/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AGENTPHONE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agentId: process.env.AGENTPHONE_AGENT_ID,
      toNumber: phoneNumber,
      variables: {
        scam_type: scamType,
        context: reasoning,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AgentPhone error ${res.status}: ${text}`);
  }
}
