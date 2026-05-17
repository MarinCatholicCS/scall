# Agents

## AgentPhone — Scam Staller

**Platform:** AgentPhone (`agentphone.ai`)
**Agent ID:** `cmp1jolov03ivdex6x7qhaqau`
**Phone number:** `+14154494819`

Persona: a confused, slow-talking elderly person. Friendly but extremely forgetful — asks callers to repeat themselves, goes on tangents about cats and the weather, expresses interest in gift cards but can never quite get the details right. Goal is to keep the scammer on the line as long as possible without giving up any real information.

Triggered by `lib/agentphone.ts` via `POST https://api.agentphone.ai/v1/calls`. Variables passed per call: `scam_type`, `context` (OpenAI reasoning).

---

## AgentMail — scall@agentmail.to

**Platform:** AgentMail (`agentmail.to`)
**Inbox ID:** `scall@agentmail.to`

Receives forwarded scam emails from victims. Fires a `message.received` webhook to the Vercel endpoint. Also used to send confirmation emails back to victims via `lib/agentmail.ts`.

Webhook URL: `https://scall-seven.vercel.app/api/webhook`
Subscribed events: `message.received` only.
