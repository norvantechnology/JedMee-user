function parseJsonBody(event) {
  if (!event || !event.body) return {};
  if (typeof event.body === "object") return event.body;
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

module.exports = { parseJsonBody };

