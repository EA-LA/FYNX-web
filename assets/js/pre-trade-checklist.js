(function () {
  'use strict';

  const list = document.querySelector('[data-pretrade-criteria]');
  const controls = document.querySelector('[data-pretrade-controls]');
  const status = controls?.querySelector('[data-pretrade-progress]');
  const reset = controls?.querySelector('[data-pretrade-reset]');
  if (!list || !status || !reset || !list.children.length) return;

  const checkboxes = Array.from(list.children, (item) => {
    const label = document.createElement('label');
    label.className = 'pretrade-choice';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('autocomplete', 'off');
    checkbox.checked = false;

    const text = document.createElement('span');
    text.append(...Array.from(item.childNodes));
    label.append(checkbox, text);
    item.append(label);
    return checkbox;
  });

  function updateProgress() {
    const checked = checkboxes.filter((checkbox) => checkbox.checked).length;
    status.textContent = `${checked} of ${checkboxes.length} checked`;
  }

  list.addEventListener('change', updateProgress);
  reset.addEventListener('click', () => {
    checkboxes.forEach((checkbox) => { checkbox.checked = false; });
    updateProgress();
  });

  list.classList.add('pretrade-active');
  updateProgress();
  controls.hidden = false;
})();
