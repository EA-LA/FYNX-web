/* Section-context images, not photographs of the current headline.
 * Per-file authorship and license verified using Commons imageinfo/extmetadata.
 * Images remain hosted by Wikimedia; no local copies or editorial alterations.
 */
(function (root) {
  'use strict';
  const sections = {
    markets: {
      context: true,
      subject: 'The New York Stock Exchange and Federal Hall at Broad and Wall Streets, New York',
      alt: 'The New York Stock Exchange and Federal Hall at the intersection of Broad Street and Wall Street',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/92/New_York_Stock_Exchange_August_2017_02.jpg/960px-New_York_Stock_Exchange_August_2017_02.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:New_York_Stock_Exchange_August_2017_02.jpg',
      credit: 'Arild Vågen', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', width: 960, height: 641
    },
    finance: {
      context: true,
      subject: 'Canary Wharf viewed from Limehouse, London',
      alt: 'The Canary Wharf skyline across the River Thames from Limehouse, London',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Canary_Wharf_from_Limehouse_London_June_2016_HDR.jpg/960px-Canary_Wharf_from_Limehouse_London_June_2016_HDR.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Canary_Wharf_from_Limehouse_London_June_2016_HDR.jpg',
      credit: 'King of Hearts', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', width: 960, height: 540
    },
    economics: {
      context: true,
      subject: 'Container cranes at the Port of Oakland, California',
      alt: 'Three container cranes at the Port of Oakland in California',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/Container_cranes_at_the_Port_of_Oakland.jpg/960px-Container_cranes_at_the_Port_of_Oakland.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Container_cranes_at_the_Port_of_Oakland.jpg',
      credit: 'Jim Heaphy (Cullen328)', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', width: 960, height: 634
    },
    technology: {
      context: true,
      subject: 'A 12-inch silicon wafer',
      alt: 'A circular 12-inch silicon wafer with a grid of semiconductor dies and colored reflections',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/eb/12-inch_silicon_wafer.jpg/960px-12-inch_silicon_wafer.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:12-inch_silicon_wafer.jpg',
      credit: 'Peellden', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', width: 960, height: 960
    },
    politics: {
      context: true,
      subject: 'The west front of the U.S. Capitol, Washington, D.C.',
      alt: 'The west front, dome and grounds of the United States Capitol in Washington, D.C.',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/United_States_Capitol_west_front_edit2.jpg/960px-United_States_Capitol_west_front_edit2.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:United_States_Capitol_west_front_edit2.jpg',
      credit: 'Architect of the Capitol; derivative by O.J.', license: 'Public domain', licenseUrl: 'https://commons.wikimedia.org/wiki/File:United_States_Capitol_west_front_edit2.jpg#Licensing', width: 960, height: 497
    },
    industries: {
      context: true,
      subject: 'Industrial robots used for automatic packaging',
      alt: 'Industrial robotic arms operating on an automatic packaging line',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Robots_empaquetado_automatico.jpg/960px-Robots_empaquetado_automatico.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Robots_empaquetado_automatico.jpg',
      credit: 'Tecnowey', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', width: 960, height: 661
    },
    energy: {
      context: true,
      subject: 'Power County Wind Farm in Idaho',
      alt: 'An aerial view of wind turbines across the Power County Wind Farm in Idaho',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/54/Power_County_Wind_Farm_002.jpg/960px-Power_County_Wind_Farm_002.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Power_County_Wind_Farm_002.jpg',
      credit: 'ENERGY.GOV', license: 'Public domain', licenseUrl: 'https://commons.wikimedia.org/wiki/File:Power_County_Wind_Farm_002.jpg#Licensing', width: 960, height: 675
    },
    world: {
      context: true,
      subject: 'NASA’s Blue Marble composite of Earth’s Eastern Hemisphere',
      alt: 'A NASA Blue Marble composite rendering of Earth’s Eastern Hemisphere using satellite and other Earth-observation data',
      url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4e/Blue_Marble_Eastern_Hemisphere.jpg/960px-Blue_Marble_Eastern_Hemisphere.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Blue_Marble_Eastern_Hemisphere.jpg',
      credit: 'NASA / Reto Stöckli, using NASA and NOAA data', license: 'Public domain', licenseUrl: 'https://commons.wikimedia.org/wiki/File:Blue_Marble_Eastern_Hemisphere.jpg#Licensing', width: 960, height: 960
    }
  };
  Object.values(sections).forEach(Object.freeze);
  Object.freeze(sections);
  function get(section) { return Object.hasOwn(sections, section) ? sections[section] : null; }
  function createFigure(section, options) {
    const item = get(section), doc = root.document;
    if (!item || !doc) return null;
    const settings = options || {};
    const figure = doc.createElement('figure');
    figure.className = 'newsroom-context-image' + (settings.className ? ' ' + settings.className : '');
    figure.dataset.contextImage = section;
    const image = doc.createElement('img');
    image.src = item.url; image.alt = item.alt;
    image.width = item.width; image.height = item.height;
    image.loading = settings.loading === 'eager' ? 'eager' : 'lazy';
    image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => figure.remove(), { once: true });
    const caption = doc.createElement('figcaption');
    const label = doc.createElement('strong'); label.textContent = 'Context: ' + item.subject + '. ';
    const source = doc.createElement('a'); source.href = item.sourceUrl; source.textContent = item.credit;
    const license = doc.createElement('a'); license.href = item.licenseUrl; license.textContent = item.license;
    [source, license].forEach(link => { link.target = '_blank'; link.rel = 'noopener noreferrer'; });
    caption.append(label, source, doc.createTextNode(' · '), license);
    figure.append(image, caption);
    return figure;
  }
  const api = Object.freeze({ sections, get, createFigure });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FYNXNewsroomMedia = api;
})(typeof window === 'undefined' ? globalThis : window);
