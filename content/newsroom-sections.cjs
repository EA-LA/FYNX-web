// Original FYNX reading guides. Current reporting is supplied by the news service.
const newsroomMedia = require('../assets/js/newsroom-media.js');
const source = {
  sec: { name: 'SEC newsroom', detail: 'Securities regulation, enforcement and company-disclosure announcements.', url: 'https://www.sec.gov/newsroom' },
  fed: { name: 'Federal Reserve', detail: 'U.S. policy decisions, statements, minutes and official announcements.', url: 'https://www.federalreserve.gov/newsevents.htm' },
  ecb: { name: 'European Central Bank', detail: 'Euro area policy announcements, speeches and publications.', url: 'https://www.ecb.europa.eu/press/pubbydate/html/index.en.html' },
  bea: { name: 'Bureau of Economic Analysis', detail: 'U.S. national accounts, income and economic release schedules.', url: 'https://www.bea.gov/news' },
  bis: { name: 'Bank for International Settlements', detail: 'Central banking, financial stability and international banking research.', url: 'https://www.bis.org/media/news' },
  imf: { name: 'International Monetary Fund', detail: 'Country assessments, economic outlooks and institutional announcements.', url: 'https://www.imf.org/en/News' },
  oecd: { name: 'OECD newsroom', detail: 'Economic, industry, technology and public-policy research.', url: 'https://www.oecd.org/en/about/newsroom.html' },
  wto: { name: 'World Trade Organization', detail: 'Trade policy, negotiations, disputes and institutional news.', url: 'https://www.wto.org/english/news_e/news_e.htm' },
  nist: { name: 'NIST news', detail: 'Technology research, measurement, standards and manufacturing.', url: 'https://www.nist.gov/news-events/news' },
  eia: { name: 'EIA · Today in Energy', detail: 'Energy production, consumption, inventories and market analysis.', url: 'https://www.eia.gov/todayinenergy/' },
  register: { name: 'Federal Register', detail: 'U.S. rulemaking documents and links to their official published versions.', url: 'https://www.federalregister.gov/' }
};
const tool = {
  research: { title: 'Company financials', detail: 'Open reported facts and the original SEC filings.', href: '/tools/company-financials.html' },
  heatmap: { title: 'Market heatmap', detail: 'Compare dated moves across supported instruments.', href: '/tools/research-heatmap.html' },
  rates: { title: 'Policy rate comparison', detail: 'Read published policy-rate observations and their dates.', href: '/tools/interest-rates.html' },
  calendar: { title: 'Economic calendar', detail: 'Review scheduled releases and central-bank events.', href: '/calendar.html' },
  screener: { title: 'Company screener', detail: 'Compare the financials of companies you select.', href: '/tools/company-screener.html' },
  news: { title: 'Symbol news search', detail: 'Follow a company or instrument into related reporting.', href: '/tools/symbol-news.html' },
  learn: { title: 'Learning center', detail: 'Build context with FYNX market guides and quizzes.', href: '/learn.html' }
};
module.exports = [
  {
    id: 'markets', category: 'stocks', title: 'Markets',
    description: 'Stocks, currencies and the forces moving capital. Follow current reporting, then examine the data behind the move.',
    focus: ['Market structure', 'Earnings', 'Cross-asset context'],
    guide: { title: 'Put the move in context.', intro: 'A FYNX reading guide for separating an observed market move from the explanation attached to it.', points: [
      { title: 'Name the comparison', text: 'Check the instrument, currency, trading session and comparison period. A price change and a total return answer different questions.' },
      { title: 'Find the first source', text: 'Trace an earnings headline to the filing or a policy headline to the statement. Keep reported facts separate from market commentary.' },
      { title: 'Check the breadth', text: 'Compare the headline index with its sectors and constituents. A large company can move a weighted index while many smaller constituents move differently.' }
    ] }, sources: [source.sec, source.fed, source.ecb], tools: [tool.heatmap, tool.research, tool.calendar], related: ['finance', 'economics', 'technology']
  },
  {
    id: 'finance', category: 'finance', title: 'Finance',
    description: 'Banking, capital markets and the business of money. Connect the reporting with balance sheets, disclosures and policy.',
    focus: ['Banking', 'Capital markets', 'Financial regulation'],
    guide: { title: 'Look through the financial headline.', intro: 'A FYNX reading guide to the institutions, documents and time horizons behind finance reporting.', points: [
      { title: 'Identify the exposure', text: 'Separate a lender, borrower, adviser and investor. The same transaction can affect each participant in a different way.' },
      { title: 'Read the terms', text: 'For a financing or acquisition, locate the announcement and distinguish proposed terms, agreed terms and completed transactions.' },
      { title: 'Compare like periods', text: 'Check reporting dates, accounting definitions and one-off items before comparing profitability, capital or credit performance.' }
    ] }, sources: [source.bis, source.sec, source.fed], tools: [tool.research, tool.screener, tool.rates], related: ['markets', 'economics', 'politics']
  },
  {
    id: 'economics', category: 'economics', title: 'Economics',
    description: 'Growth, inflation, jobs and central banks. Read the release, check the revision and keep the timeline in view.',
    focus: ['Inflation & employment', 'Central banks', 'Growth & trade'],
    guide: { title: 'Read beyond the first number.', intro: 'A FYNX reading guide for following an economic release from its headline to its underlying series.', points: [
      { title: 'Check the measurement', text: 'Look for the unit, frequency and seasonal adjustment. Monthly, annual and annualized changes cannot be compared interchangeably.' },
      { title: 'Track the vintage', text: 'Record the publication date and the period measured. A revised prior figure can change the context of a new release.' },
      { title: 'Separate data from expectations', text: 'An actual release, a survey forecast and a central-bank projection are different observations. Read the source and reference date of each.' }
    ] }, sources: [source.bea, source.ecb, source.imf], tools: [tool.calendar, tool.rates, tool.learn], related: ['markets', 'finance', 'world']
  },
  {
    id: 'technology', category: 'technology', title: 'Technology',
    description: 'Artificial intelligence, chips, software and the digital economy. Follow the companies, research and policy shaping what comes next.',
    focus: ['AI & software', 'Semiconductors', 'Digital infrastructure'],
    guide: { title: 'Separate a milestone from a business model.', intro: 'A FYNX reading guide for checking the evidence behind technology announcements.', points: [
      { title: 'Find the evidence', text: 'Distinguish a product announcement, research result, benchmark and customer deployment. Check what was actually measured or released.' },
      { title: 'Follow the spending', text: 'Read company filings for revenue, research spending and capital expenditure. Keep commitments and projections separate from reported results.' },
      { title: 'Map the dependencies', text: 'Look for suppliers, compute infrastructure, distribution and standards. A technology story can reach far beyond the company in its headline.' }
    ] }, sources: [source.nist, source.sec, source.oecd], tools: [tool.research, tool.news, tool.screener], related: ['markets', 'industries', 'politics']
  },
  {
    id: 'politics', category: 'politics', title: 'Politics & Policy',
    description: 'Government decisions, trade and regulation through an economic lens. Follow what is proposed, what is adopted and when it takes effect.',
    focus: ['Public policy', 'Trade & regulation', 'Government decisions'],
    guide: { title: 'Follow the decision to the document.', intro: 'A FYNX reading guide for distinguishing a political announcement from an operative policy change.', points: [
      { title: 'Identify the stage', text: 'A speech, proposal, vote, published rule and effective date mark different stages. Find the primary document and the authority responsible.' },
      { title: 'Read the scope', text: 'Check the jurisdiction, affected activity and stated exceptions. Avoid extending a policy beyond the entities or transactions it covers.' },
      { title: 'Keep the timeline', text: 'Track implementation dates, consultation windows and later amendments. Revisit the source when a headline refers to a developing decision.' }
    ] }, sources: [source.register, source.wto, source.oecd], tools: [tool.calendar, tool.rates, tool.news], related: ['economics', 'world', 'industries']
  },
  {
    id: 'industries', category: 'industries', title: 'Industries',
    description: 'Companies, supply chains and the real economy. Follow how sector developments connect to reported business performance.',
    focus: ['Manufacturing', 'Consumer businesses', 'Supply chains'],
    guide: { title: 'Follow the operating story.', intro: 'A FYNX reading guide to connecting industry developments with company-level evidence.', points: [
      { title: 'Define the value chain', text: 'Identify producers, suppliers, distributors and customers. A change in input cost or demand need not affect every business equally.' },
      { title: 'Match the measures', text: 'Compare volumes, pricing and margins over consistent periods. Reported revenue alone does not describe how a business generated growth.' },
      { title: 'Check the company detail', text: 'Read segment disclosures, geographic exposure and management discussion. Sector labels can hide very different operating businesses.' }
    ] }, sources: [source.sec, source.oecd, source.wto], tools: [tool.screener, tool.research, tool.news], related: ['technology', 'energy', 'finance']
  },
  {
    id: 'energy', category: 'energy', title: 'Energy',
    description: 'Oil, gas, power and the energy transition. Connect supply, demand, infrastructure and policy with their original data.',
    focus: ['Oil & gas', 'Electricity', 'Energy transition'],
    guide: { title: 'Trace the physical market.', intro: 'A FYNX reading guide for reading energy headlines alongside the market they describe.', points: [
      { title: 'Specify the benchmark', text: 'Check the fuel, location, delivery period and quoted unit. Different contracts and regional markets can tell different stories.' },
      { title: 'Separate stocks and flows', text: 'Inventories measure a stock at a point in time; production and consumption measure flows over a period. Check the date and unit of each.' },
      { title: 'Read the assumption', text: 'A forecast depends on its scenario and publication date. Keep forecasts separate from observed production, consumption and capacity.' }
    ] }, sources: [source.eia, source.oecd, source.sec], tools: [tool.news, tool.research, tool.calendar], related: ['industries', 'economics', 'world']
  },
  {
    id: 'world', category: 'world', title: 'World',
    description: 'Global developments with economic consequences. Connect regional reporting, trade and institutions without losing the local context.',
    focus: ['Global affairs', 'International trade', 'Regional economies'],
    guide: { title: 'Keep the local context.', intro: 'A FYNX reading guide for comparing international reporting across regions and institutions.', points: [
      { title: 'Locate the event', text: 'Identify the jurisdiction, local date and relevant institution. Publication time and the time of the underlying event may differ.' },
      { title: 'Compare the definitions', text: 'Check currency, reporting period and statistical definitions before comparing countries. A similarly named indicator may use a different method.' },
      { title: 'Follow the original record', text: 'Use institutional releases and primary documents alongside reporting. Separate confirmed developments from proposals, forecasts and attributed claims.' }
    ] }, sources: [source.imf, source.wto, source.oecd], tools: [tool.calendar, tool.rates, tool.learn], related: ['politics', 'economics', 'energy']
  }
].map(section => ({ ...section, contextImage: newsroomMedia.get(section.id) }));
