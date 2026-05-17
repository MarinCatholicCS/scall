curl -X POST https://scall-seven.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "message.received",
    "message": {
      "message_id": "test-self-1",
      "inbox_id": "scall@agentmail.to",
      "thread_id": "test-thread",
      "from_": "stanleyho862@gmail.com",
      "to": "scall@agentmail.to",
      "subject": "URGENT: IRS Final Notice",
      "text": "This is the IRS. You owe $3,200 in back taxes. Call us immediately at 415-488-3120 or a warrant will be issued for your arrest."
    }
  }'
