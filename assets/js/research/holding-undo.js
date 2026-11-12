/* A short, account-scoped undo for accidental removal of a manual position.
 * This never places an order or changes valuation formulas. */
export const HOLDING_UNDO_WINDOW_MS = 15_000;

export function stageHoldingRemoval(holding, scope, revision, now = Date.now()) {
  if (!holding || typeof holding.id !== 'string' || !holding.id ||
      typeof scope !== 'string' || !scope || !Number.isSafeInteger(revision)) {
    throw new TypeError('Cannot stage an invalid holding removal.');
  }
  return {
    holding: { ...holding },
    scope,
    revision,
    expiresAt: now + HOLDING_UNDO_WINDOW_MS
  };
}

export function canUndoHolding(entry, scope, revision, now = Date.now()) {
  return Boolean(entry && entry.holding && entry.scope === scope &&
    entry.revision === revision && now < entry.expiresAt);
}

export function restoreRemovedHolding(holdings, entry) {
  if (!Array.isArray(holdings) || !entry?.holding) {
    throw new TypeError('No removed position to restore.');
  }
  if (holdings.some(holding => holding.id === entry.holding.id)) {
    throw new Error('This position already exists. Nothing was changed.');
  }
  if (holdings.length >= 100) {
    throw new Error('The portfolio has reached its 100-position limit.');
  }
  holdings.push({ ...entry.holding });
}
