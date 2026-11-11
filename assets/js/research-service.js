// The public website is hosted on Pages. Its research API runs in the site's Firebase project.
(function () {
  'use strict';
  const production = location.protocol === 'https:' &&
    ['www.fynxfinanceworld.com', 'fynxfinanceworld.com'].includes(location.hostname);
  const service = 'https://us-central1-fynx-c7a28.cloudfunctions.net/webTradingResearch';

  function apiURL(path) {
    if (typeof path !== 'string' || !/^\/api\/(?:edge|quant)\//.test(path)) {
      throw new Error('Unknown research API route.');
    }
    return production ? service + path : path;
  }

  window.FynxResearchService = Object.freeze({ production, apiURL });
})();
