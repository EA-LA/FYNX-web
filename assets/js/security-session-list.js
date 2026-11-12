// Keep device-supplied session metadata as text. Never insert it as HTML.
function displayValue(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function renderSessionMetadata(container, sessions) {
  if (!container) return;
  if (!Array.isArray(sessions) || sessions.length === 0) {
    container.textContent = 'No session metadata yet';
    return;
  }

  const doc = container.ownerDocument;
  const fragment = doc.createDocumentFragment();
  for (const session of sessions) {
    const row = doc.createElement('div');
    row.className = 'security-session-row';
    const device = doc.createElement('strong');
    device.textContent = displayValue(session?.platform, 'Device');
    row.append(
      device,
      doc.createTextNode(` • ${displayValue(session?.timezone, 'UTC')} • ${displayValue(session?.status, 'active')}`)
    );
    fragment.appendChild(row);
  }
  container.replaceChildren(fragment);
}
