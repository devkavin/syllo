// Keep the visible transcript intact; only bound what goes to the provider.
export function recentChatContext(messages) {
  const candidates = messages
    .filter((message) => message.text?.trim() && !message.pending && !message.isGreeting)
    .slice(-6);
  const selected = [];
  let length = 0;
  for (const message of candidates.reverse()) {
    const text = message.text.slice(0, 2000);
    const nextLength = `${message.role}: ${text}`.length + (selected.length ? 1 : 0);
    if (length + nextLength > 4000) break;
    selected.unshift({ role: message.role, text });
    length += nextLength;
  }
  while (selected[0]?.role === "model") selected.shift();
  return selected;
}
