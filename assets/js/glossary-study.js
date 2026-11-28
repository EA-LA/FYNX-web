(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const study = byId('glossary-study');
  if (!study) return;

  const core = Array.from(document.querySelectorAll('.glossary-grid > .term-card'), card => ({
    term: card.querySelector('h3')?.textContent.trim(),
    topic: card.querySelector('.badge')?.textContent.trim(),
    definition: card.querySelector('p')?.textContent.trim()
  })).filter(item => item.term && item.topic && item.definition);
  if (!core.length) return;
  // Keep the full combined deck available, and include its terms in each subject
  // shown on the badge (the same subject membership as the glossary finder).
  const topicKeys = topic => [...new Set([topic, ...topic.split('/').map(part => part.trim()).filter(Boolean)])];

  const select = byId('glossary-study-topic');
  const term = byId('glossary-study-term');
  const progress = byId('glossary-study-position');
  const definition = byId('glossary-study-definition');
  const reveal = byId('glossary-study-reveal');
  const back = byId('glossary-study-back');
  const next = byId('glossary-study-next');

  for (const topic of [...new Set(core.flatMap(item => topicKeys(item.topic)))].sort()) {
    const option = document.createElement('option');
    option.value = topic;
    option.textContent = topic;
    select.append(option);
  }

  let deck = core;
  let index = 0;
  function showDefinition(show) {
    if (show) {
      definition.hidden = false;
      definition.textContent = deck[index].definition;
    } else {
      definition.hidden = true;
      definition.textContent = '';
    }
    reveal.setAttribute('aria-expanded', String(show));
    reveal.textContent = show ? 'Hide definition' : 'Reveal definition';
  }

  function render() {
    showDefinition(false);
    progress.textContent = `${deck[index].topic} · Term ${index + 1} of ${deck.length}`;
    term.textContent = deck[index].term;
    back.disabled = next.disabled = deck.length === 1;
    back.textContent = index === 0 && deck.length > 1 ? 'Go to last term' : 'Previous term';
    next.textContent = index === deck.length - 1 && deck.length > 1 ? 'Start deck over' : 'Next term';
  }

  select.addEventListener('change', () => {
    deck = select.value ? core.filter(item => topicKeys(item.topic).includes(select.value)) : core;
    if (!deck.length) {
      select.value = '';
      deck = core;
    }
    index = 0;
    render();
  });
  reveal.addEventListener('click', () => showDefinition(definition.hidden));
  back.addEventListener('click', () => {
    index = (index + deck.length - 1) % deck.length;
    render();
  });
  next.addEventListener('click', () => {
    index = (index + 1) % deck.length;
    render();
  });

  render();
  study.hidden = false;
  byId('glossary-study-link').hidden = false;
})();
