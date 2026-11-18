// Restore keyboard focus after re-rendering a portfolio or alert list.
// Removed rows focus the nearest safe action, not another destructive button.
export function replaceMarkupWithFocus(container, markup, kind, fallbackSelector) {
  const primary = kind === 'alerts' ? 'toggleAlert' : 'editHolding';
  const destructive = kind === 'alerts' ? 'deleteAlert' : 'deleteHolding';
  const focused = document.activeElement;
  const action = container.contains(focused) && [primary, destructive].find(key => focused?.dataset?.[key]);
  const id = action ? focused.dataset[action] : null;
  const before = Array.from(container.querySelectorAll('button')).filter(button => button.dataset?.[primary]);
  const position = before.findIndex(button => button.dataset[primary] === id);

  container.innerHTML = markup;
  if (!id) return;
  const after = Array.from(container.querySelectorAll('button'));
  const sameAction = after.find(button => button.dataset?.[action] === id);
  const safeActions = after.filter(button => button.dataset?.[primary]);
  const nearestSafeAction = safeActions[Math.min(Math.max(position, 0), safeActions.length - 1)];
  (sameAction || nearestSafeAction || document.querySelector(fallbackSelector))?.focus({ preventScroll: true });
}
