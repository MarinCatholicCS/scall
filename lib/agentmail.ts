export async function sendConfirmation(
  to: string,
  scamType: string,
  phoneNumber: string
): Promise<void> {
  const inboxId = process.env.AGENTMAIL_INBOX_ID;
  const res = await fetch(
    `https://api.agentmail.to/v0/inboxes/${inboxId}/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AGENTMAIL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        subject: "We're stalling your scammer",
        text: `Hi,

We received the suspicious email you forwarded to us. Our system identified it as a "${scamType}" scam.

We've already called the scammer's number (${phoneNumber}) and our AI agent is keeping them on the line right now, wasting their time so they can't target you or anyone else.

You don't need to do anything else. Stay safe!

— The Scall Team`,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AgentMail error ${res.status}: ${text}`);
  }
}
