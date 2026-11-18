// Confirmed-save controller for account-scoped FYNX notification settings.
// Never portray an optimistic switch state as a persisted preference.
export function createNotificationPreferenceController({ keys, currentUid, save, render, report }) {
  const allowed = [...new Set(keys)];
  let owner = null;
  let ready = false;
  let generation = 0;
  let values = Object.create(null);
  const pending = new Set();

  function paint(key) {
    render(key, {
      checked: Boolean(values[key]),
      busy: pending.has(key),
      disabled: !ready || !owner || pending.has(key)
    });
  }
  function reset(uid) {
    generation += 1;
    owner = uid || null;
    ready = false;
    values = Object.create(null);
    pending.clear();
    allowed.forEach(paint);
  }
  function load(uid, preferences) {
    if (!uid || uid !== owner || uid !== currentUid()) return false;
    values = Object.assign(Object.create(null), preferences || {});
    ready = true;
    allowed.forEach(paint);
    return true;
  }
  async function set(key, value) {
    if (!allowed.includes(key) || !ready || !owner || owner !== currentUid() || pending.has(key)) return false;
    const next = Boolean(value);
    if (next === Boolean(values[key])) return true;
    const saveOwner = owner;
    const saveGeneration = generation;
    pending.add(key);
    paint(key);
    report('Saving notification preference…');
    try {
      await save(saveOwner, { [key]: next });
      if (saveGeneration !== generation || saveOwner !== owner || saveOwner !== currentUid()) return false;
      values[key] = next;
      report('Notification preference saved.');
      return true;
    } catch {
      if (saveGeneration === generation && saveOwner === owner && saveOwner === currentUid()) {
        report('Could not save notification preference. Your previous setting is unchanged. Try again.');
      }
      return false;
    } finally {
      if (saveGeneration === generation) {
        pending.delete(key);
        paint(key);
      }
    }
  }
  function toggle(key) { return set(key, !Boolean(values[key])); }
  reset(null);
  return { reset, load, set, toggle };
}
