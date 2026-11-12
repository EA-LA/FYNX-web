/* FYNX Terminal. Every panel renders attributed live data; anything clickable opens a chart, a detail view or a full
 * in-terminal page. People stay inside the terminal: same-site pages open as terminal pages, outside sources in a new tab.
 * External text is inserted with textContent only. Nothing is estimated in the browser except clearly labeled calculations. */
(() => {
  'use strict';
  const M = window.FynxMacroModel;
  if (!M) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const FN = name => local ? (name === 'webResearchData' ? '/api/research' : '/api/' + name) : 'https://us-central1-fynx-c7a28.cloudfunctions.net/' + name;
  const RESEARCH = ['https://raw.githubusercontent.com/EA-LA/FYNX-web/research-data/assets/data/research/', '/assets/data/research/'];
  const DESK_URL = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/macro-data/desk.json';
  const TDATA = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/terminal-data/';
  const CATALOG = [
    ['AAPL', 'Apple', 'Stocks'], ['MSFT', 'Microsoft', 'Stocks'], ['NVDA', 'NVIDIA', 'Stocks'], ['AMZN', 'Amazon', 'Stocks'], ['GOOGL', 'Alphabet', 'Stocks'], ['META', 'Meta', 'Stocks'], ['TSLA', 'Tesla', 'Stocks'], ['JPM', 'JPMorgan', 'Stocks'], ['V', 'Visa', 'Stocks'], ['WMT', 'Walmart', 'Stocks'],
    ['XOM', 'Exxon Mobil', 'Stocks'], ['JNJ', 'Johnson & Johnson', 'Stocks'], ['BRK-B', 'Berkshire Hathaway', 'Stocks'], ['AVGO', 'Broadcom', 'Stocks'], ['COST', 'Costco', 'Stocks'], ['NFLX', 'Netflix', 'Stocks'], ['AMD', 'AMD', 'Stocks'], ['DIS', 'Disney', 'Stocks'], ['KO', 'Coca-Cola', 'Stocks'], ['BAC', 'Bank of America', 'Stocks'],
    ['SPY', 'S&P 500 ETF', 'ETFs'], ['QQQ', 'Nasdaq 100 ETF', 'ETFs'], ['IWM', 'Russell 2000 ETF', 'ETFs'], ['DIA', 'Dow Jones ETF', 'ETFs'], ['VTI', 'US total market ETF', 'ETFs'], ['TLT', 'Long Treasury ETF', 'ETFs'], ['GLD', 'Gold ETF', 'ETFs'], ['XLF', 'Financials ETF', 'ETFs'], ['XLK', 'Technology ETF', 'ETFs'], ['XLE', 'Energy ETF', 'ETFs'],
    ['BTC-USD', 'Bitcoin', 'Crypto'], ['ETH-USD', 'Ethereum', 'Crypto'], ['SOL-USD', 'Solana', 'Crypto'], ['LTC-USD', 'Litecoin', 'Crypto'],
    ['EURUSD=X', 'EUR/USD', 'FX'], ['GBPUSD=X', 'GBP/USD', 'FX'], ['JPY=X', 'USD/JPY', 'FX'], ['AUDUSD=X', 'AUD/USD', 'FX'], ['CAD=X', 'USD/CAD', 'FX'], ['CHF=X', 'USD/CHF', 'FX']
  ].map(([symbol, name, group]) => ({symbol, name, group}));
  const FX_TO_EDGE = {'EURUSD=X': 'EURUSD', 'GBPUSD=X': 'GBPUSD', 'JPY=X': 'USDJPY', 'AUDUSD=X': 'AUDUSD', 'CAD=X': 'USDCAD', 'CHF=X': 'USDCHF', 'NZDUSD=X': 'NZDUSD', 'EURJPY=X': 'EURJPY', 'GBPJPY=X': 'GBPJPY', 'EURGBP=X': 'EURGBP'};
  const EDGE_TO_FX = Object.fromEntries(Object.entries(FX_TO_EDGE).map(([a, b]) => [b, a]));
  const EDGE = {EURUSD: ['EUR/USD', 0.0001, 5], GBPUSD: ['GBP/USD', 0.0001, 5], USDJPY: ['USD/JPY', 0.01, 3], AUDUSD: ['AUD/USD', 0.0001, 5], USDCAD: ['USD/CAD', 0.0001, 5], USDCHF: ['USD/CHF', 0.0001, 5], NZDUSD: ['NZD/USD', 0.0001, 5],
    XAUUSD: ['Gold', 0.1, 2], XAGUSD: ['Silver', 0.01, 3], EURJPY: ['EUR/JPY', 0.01, 3], GBPJPY: ['GBP/JPY', 0.01, 3], EURGBP: ['EUR/GBP', 0.0001, 5], US30: ['US 30', 1, 1], NAS100: ['US Tech 100', 1, 1], SPX500: ['US 500', 0.1, 2], BTCUSD: ['Bitcoin (CFD)', 1, 2], ETHUSD: ['Ethereum (CFD)', 0.1, 2]};
  const ALIASES = {GOLD: 'XAUUSD', XAU: 'XAUUSD', SILVER: 'XAGUSD', BTC: 'BTC-USD', BITCOIN: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', LTC: 'LTC-USD', SPX: 'SPX500', NDX: 'NAS100', DOW: 'US30', BRK: 'BRK-B', BRKB: 'BRK-B',
    ES: 'ES=F', NQ: 'NQ=F', YM: 'YM=F', RTY: 'RTY=F', CL: 'CL=F', OIL: 'CL=F', WTI: 'CL=F', CRUDE: 'CL=F', BRENT: 'BZ=F', NATGAS: 'NG=F', NG: 'NG=F', COPPER: 'HG=F', CORN: 'ZC=F', WHEAT: 'ZW=F', SOY: 'ZS=F', COFFEE: 'KC=F', COCOA: 'CC=F', ZN: 'ZN=F', ZB: 'ZB=F',
    VIX: '^VIX', VVIX: '^VVIX', DXY: 'DX-Y.NYB', DAX: '^GDAXI', FTSE: '^FTSE', UKX: '^FTSE', CAC: '^FCHI', NIKKEI: '^N225', NKY: '^N225', HSI: '^HSI', HANGSENG: '^HSI', SP500: '^GSPC', 'S&P500': '^GSPC', NASDAQ: '^IXIC', RUSSELL: '^RUT', RUT: '^RUT',
    US10Y: '^TNX', TNX: '^TNX', US30Y: '^TYX', US5Y: '^FVX', MOVE: '^MOVE', XRP: 'XRP-USD', DOGE: 'DOGE-USD', ADA: 'ADA-USD', BNB: 'BNB-USD', AVAX: 'AVAX-USD', LINK: 'LINK-USD'};
  const SHORT = {'^GSPC': 'SPX', '^DJI': 'INDU', '^IXIC': 'CCMP', '^NDX': 'NDX', '^RUT': 'RUT', '^GSPTSE': 'TSX', '^BVSP': 'IBOV', '^FTSE': 'UKX', '^GDAXI': 'DAX', '^FCHI': 'CAC', '^STOXX50E': 'SX5E', '^N225': 'NKY', '^HSI': 'HSI', '000001.SS': 'SHCOMP', '^AXJO': 'AS51', '^KS11': 'KOSPI', '^NSEI': 'NIFTY', 'DX-Y.NYB': 'DXY', '^IRX': 'US3M', '^FVX': 'US5Y', '^TNX': 'US10Y', '^TYX': 'US30Y'};
  const TICKER = ['SPY', 'QQQ', 'DIA', 'IWM', 'TLT', 'GLD', 'BTC-USD', 'ETH-USD', 'EURUSD=X', 'GBPUSD=X', 'JPY=X', 'AAPL', 'NVDA', 'MSFT'];
  const NEWS_CATS = [['all', 'All'], ['forex', 'FX'], ['macro', 'Macro'], ['economics', 'Econ'], ['stocks', 'Stocks'], ['finance', 'Finance'], ['crypto', 'Crypto'], ['commodities', 'Cmdty'], ['energy', 'Energy'], ['technology', 'Tech'], ['industries', 'Industry'], ['politics', 'Policy'], ['world', 'World'], ['analysis', 'Analysis']];
  const SESSIONS = [['SYD', 'Sydney', 'Australia/Sydney', 7, 16], ['TKY', 'Tokyo', 'Asia/Tokyo', 9, 18], ['LDN', 'London', 'Europe/London', 8, 17], ['NY', 'New York', 'America/New_York', 8, 17]];
  const EXCHANGES = [['NYSE', 'New York Stock Exchange', 'America/New_York', 9.5, 16, '^GSPC'], ['TSX', 'Toronto', 'America/Toronto', 9.5, 16, '^GSPTSE'], ['B3', 'São Paulo', 'America/Sao_Paulo', 10, 17, '^BVSP'], ['LSE', 'London', 'Europe/London', 8, 16.5, '^FTSE'], ['XETRA', 'Frankfurt', 'Europe/Berlin', 9, 17.5, '^GDAXI'], ['EPA', 'Paris', 'Europe/Paris', 9, 17.5, '^FCHI'],
    ['TSE', 'Tokyo', 'Asia/Tokyo', 9, 15.5, '^N225'], ['HKEX', 'Hong Kong', 'Asia/Hong_Kong', 9.5, 16, '^HSI'], ['SSE', 'Shanghai', 'Asia/Shanghai', 9.5, 15, '000001.SS'], ['ASX', 'Sydney', 'Australia/Sydney', 10, 16, '^AXJO'], ['KRX', 'Seoul', 'Asia/Seoul', 9, 15.5, '^KS11'], ['NSE', 'Mumbai', 'Asia/Kolkata', 9.25, 15.5, '^NSEI']];
  // CME contract specifications (dollars per 1.0 price point, minimum tick).
  const FUTSPEC = {'ES=F': ['E-mini S&P 500', 50, 0.25], 'NQ=F': ['E-mini Nasdaq 100', 20, 0.25], 'YM=F': ['E-mini Dow', 5, 1], 'RTY=F': ['E-mini Russell 2000', 50, 0.1], 'CL=F': ['WTI crude oil', 1000, 0.01], 'NG=F': ['Natural gas', 10000, 0.001],
    'GC=F': ['Gold', 100, 0.1], 'SI=F': ['Silver', 5000, 0.005], 'HG=F': ['Copper', 25000, 0.0005], 'ZN=F': ['10-Year T-Note', 1000, 1 / 64], 'ZB=F': ['30-Year T-Bond', 1000, 1 / 32], '6E=F': ['Euro FX', 125000, 0.00005], '6J=F': ['Japanese yen', 12500000, 0.0000005]};

  /* --- desks ------------------------------------------------------------------ */
  const FUNDS = ['Equity funds', 'Sector funds', 'Bond funds', 'International funds', 'Commodity funds'];
  const FUTS = ['Equity futures', 'Rate futures', 'Energy', 'Metals', 'Agriculture', 'Currency futures'];
  const DESK_DEFS = {
    all: {label: 'ALL', noun: 'Markets', who: 'every trader', slots: ['mkts', 'focus', 'story', 'intel', 'cb', 'eco', 'top', 'curve', 'bias', 'edge', 'heat', 'fin', 'desks', 'vix', 'pos', 'tools'],
      mkts: [['EQ', ['Stocks']], ['ETF', FUNDS], ['CRY', ['Crypto']], ['FX', ['FX majors', 'FX crosses']], ['FUT', FUTS], ['IDX', ['Americas', 'Europe', 'Asia-Pacific']]], focus: 'SPY', heat: ['Stocks', 'Equity funds', 'Crypto'], news: 'all', newsTabs: NEWS_CATS.map(n => n[0]).filter(k => k !== 'all'), calc: 'fx', storyKind: 'macro'},
    stocks: {label: 'STOCKS', noun: 'Stocks', who: 'stock traders', slots: ['mkts', 'focus', 'intel', 'movers', 'top', 'eco', 'story', 'idx', 'earn', 'vix', 'heat', 'fin', 'xa', 'desks', 'opt', 'tools'],
      mkts: [['STK', ['Stocks']], ['IDX', ['Americas']], ['SECT', ['Sector funds']]], focus: 'AAPL', heat: ['Stocks'], movers: ['Stocks'], news: 'stocks', newsTabs: ['stocks', 'technology', 'finance', 'industries', 'analysis'], ccy: ['USD'], edge: ['US30', 'NAS100', 'SPX500'],
      xa: ['^GSPC', '^NDX', '^TNX', 'DX-Y.NYB', 'GC=F', 'CL=F', 'BTC-USD', '^VIX'], idx: {title: 'Index & sector funds', groups: ['Equity funds', 'Sector funds']}, opt: 'AAPL', calc: 'shares', anchors: [['^GSPC', 'S&P 500'], ['^NDX', 'Nasdaq 100'], ['^VIX', 'VIX']], metric: '^VIX'},
    forex: {label: 'FOREX', noun: 'FX', who: 'FX traders', slots: ['mkts', 'focus', 'intel', 'story', 'cb', 'eco', 'top', 'bias', 'edge', 'range', 'sess', 'corr', 'pos', 'desks', 'curve', 'tools'],
      mkts: [['MAJ', ['FX majors']], ['CRS', ['FX crosses']], ['EM', ['FX emerging']], ['FUT', ['Currency futures']]], focus: 'EURUSD', heat: ['FX majors', 'FX crosses', 'FX emerging'], movers: ['FX majors', 'FX crosses', 'FX emerging'], news: 'forex', newsTabs: ['forex', 'macro', 'economics', 'politics', 'world'],
      edge: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP'], xa: ['DX-Y.NYB', '^TNX', '^GSPC', 'GC=F', 'CL=F', '^VIX'], calc: 'fx', storyKind: 'macro', range: 'EURUSD'},
    bonds: {label: 'BONDS', noun: 'Bonds', who: 'rates traders', slots: ['mkts', 'focus', 'intel', 'story', 'curve', 'gov', 'cb', 'rates', 'eco', 'top', 'heat', 'term', 'opt', 'movers', 'desks', 'tools'],
      mkts: [['YLD', ['Yields']], ['FUT', ['Rate futures']], ['ETF', ['Bond funds']]], focus: '^TNX', heat: ['Bond funds', 'Rate futures'], movers: ['Yields', 'Rate futures', 'Bond funds'], news: 'economics', newsTabs: ['economics', 'macro', 'finance', 'politics', 'world'], ccy: ['USD', 'EUR', 'GBP', 'JPY'],
      xa: ['^GSPC', 'DX-Y.NYB', 'GC=F', '^MOVE', '^VIX', 'JPY=X'], opt: 'TLT', calc: 'bond', storyKind: 'macro', vol: ['^MOVE', '^VIX', '^VIX3M']},
    crypto: {label: 'CRYPTO', noun: 'Crypto', who: 'crypto traders', slots: ['mkts', 'focus', 'intel', 'story', 'movers', 'books', 'top', 'edge', 'pos', 'heat', 'xa', 'desks', 'eco', 'range', 'vix', 'tools'],
      mkts: [['COIN', ['Crypto']], ['PROXY', {syms: ['BTC=F', 'IBIT', 'ETH-USD', 'BTC-USD']}]], focus: 'BTC-USD', heat: ['Crypto'], movers: ['Crypto'], news: 'crypto', newsTabs: ['crypto', 'technology', 'finance', 'politics', 'analysis'], ccy: ['USD'], edge: ['BTCUSD', 'ETHUSD'],
      xa: ['^NDX', '^GSPC', 'DX-Y.NYB', 'GC=F', '^TNX', 'IBIT', 'BTC=F'], calc: 'crypto', anchors: [['BTC-USD', 'Bitcoin'], ['ETH-USD', 'Ethereum'], ['SOL-USD', 'Solana']], metric: 'BTC-USD', range: 'BTCUSD'},
    funds: {label: 'FUNDS', noun: 'Funds', who: 'fund investors', slots: ['mkts', 'focus', 'intel', 'movers', 'story', 'heat', 'perf', 'opt', 'top', 'eco', 'xa', 'desks', 'curve', 'term', 'cb', 'tools'],
      mkts: [['EQ', ['Equity funds']], ['SECT', ['Sector funds']], ['BOND', ['Bond funds']], ['INTL', ['International funds']], ['CMDY', ['Commodity funds']]], focus: 'SPY', heat: ['Sector funds'], movers: FUNDS, perf: FUNDS, news: 'finance', newsTabs: ['finance', 'stocks', 'economics', 'analysis', 'world'], ccy: ['USD'],
      xa: ['^GSPC', '^TNX', 'DX-Y.NYB', 'GC=F', 'CL=F', 'BTC-USD'], opt: 'SPY', calc: 'shares', anchors: [['SPY', 'S&P 500 fund'], ['AGG', 'US bond fund'], ['GLD', 'Gold fund']], metric: '^VIX'},
    futures: {label: 'FUTURES', noun: 'Futures', who: 'futures traders', slots: ['mkts', 'focus', 'intel', 'story', 'movers', 'heat', 'perf', 'pos', 'cb', 'eco', 'top', 'term', 'curve', 'desks', 'sess', 'tools'],
      mkts: [['EQ', ['Equity futures']], ['RATE', ['Rate futures']], ['NRG', ['Energy']], ['MET', ['Metals']], ['AGS', ['Agriculture']], ['CCY', ['Currency futures']]], focus: 'ES=F', heat: FUTS, movers: FUTS, perf: FUTS, news: 'commodities', newsTabs: ['commodities', 'energy', 'macro', 'stocks', 'economics'], ccy: ['USD'],
      edge: ['US30', 'NAS100', 'SPX500', 'XAUUSD', 'XAGUSD', 'EURUSD', 'USDJPY', 'GBPUSD', 'BTCUSD'], xa: ['^GSPC', '^TNX', 'DX-Y.NYB'], calc: 'futures', anchors: [['ES=F', 'E-mini S&P'], ['CL=F', 'Crude'], ['GC=F', 'Gold'], ['ZN=F', '10-year note']], metric: '^VIX'},
    indices: {label: 'INDICES', noun: 'World indices', who: 'index traders', slots: ['mkts', 'focus', 'intel', 'story', 'movers', 'sess', 'perf', 'heat', 'edge', 'term', 'top', 'eco', 'pos', 'desks', 'optlist', 'tools'],
      mkts: [['AMER', ['Americas']], ['EUR', ['Europe']], ['APAC', ['Asia-Pacific']], ['FUT', ['Equity futures']], ['VOL', ['Volatility', 'Dollar']]], focus: '^GSPC', heat: ['Americas', 'Europe', 'Asia-Pacific'], movers: ['Americas', 'Europe', 'Asia-Pacific'], perf: ['Americas', 'Europe', 'Asia-Pacific'], news: 'world', newsTabs: ['world', 'stocks', 'economics', 'politics', 'analysis'],
      edge: ['US30', 'NAS100', 'SPX500'], xa: ['^TNX', 'DX-Y.NYB', 'GC=F', 'CL=F'], calc: 'shares', anchors: [['^GSPC', 'S&P 500'], ['^GDAXI', 'DAX'], ['^N225', 'Nikkei']], metric: '^VIX', sessions: 'exchanges'},
    economy: {label: 'ECONOMY', noun: 'Economy', who: 'macro traders', slots: ['eco', 'cb', 'intel', 'story', 'curve', 'gov', 'top', 'rates', 'bias', 'xa', 'desks', 'official', 'term', 'pos', 'sess', 'tools'],
      mkts: [['MACRO', ['Yields', 'Dollar', 'Volatility']]], focus: 'DX-Y.NYB', news: 'economics', newsTabs: ['economics', 'macro', 'politics', 'world', 'finance'], xa: ['DX-Y.NYB', '^TNX', '^GSPC', 'CL=F', 'GC=F', 'HG=F', 'BTC-USD', '^VIX'], calc: 'real', storyKind: 'macro'},
    options: {label: 'OPTIONS', noun: 'Options', who: 'options traders', slots: ['optlist', 'chain', 'intel', 'opt', 'focus', 'term', 'active', 'earn', 'eco', 'story', 'top', 'vix', 'xa', 'desks', 'movers', 'tools'],
      mkts: [['VOL', ['Volatility']]], focus: 'SPY', movers: ['Stocks', 'Equity funds'], news: 'stocks', newsTabs: ['stocks', 'analysis', 'technology', 'finance', 'economics'], ccy: ['USD'], xa: ['^VIX', '^VVIX', '^VXN', '^MOVE', '^OVX', '^GVZ'], opt: 'SPY', calc: 'options', anchors: [['SPY', 'SPY'], ['QQQ', 'QQQ']], metric: '^VIX'},
    commodities: {label: 'COMMODITIES', noun: 'Commodities', who: 'commodity traders', slots: ['mkts', 'focus', 'intel', 'story', 'movers', 'heat', 'perf', 'pos', 'edge', 'term', 'top', 'desks', 'xa', 'eco', 'opt', 'tools'],
      mkts: [['NRG', ['Energy']], ['MET', ['Metals']], ['AGS', ['Agriculture']], ['ETF', ['Commodity funds']]], focus: 'CL=F', heat: ['Energy', 'Metals', 'Agriculture'], movers: ['Energy', 'Metals', 'Agriculture', 'Commodity funds'], perf: ['Energy', 'Metals', 'Agriculture'], news: 'commodities', newsTabs: ['commodities', 'energy', 'industries', 'world', 'economics'], ccy: ['USD', 'AUD', 'CAD'],
      edge: ['XAUUSD', 'XAGUSD'], xa: ['DX-Y.NYB', '^TNX', '^GSPC', 'BTC-USD', 'AUDUSD=X', 'CAD=X'], opt: 'GLD', calc: 'futures', anchors: [['CL=F', 'WTI crude'], ['GC=F', 'Gold'], ['HG=F', 'Copper']], metric: '^OVX', vol: ['^OVX', '^GVZ', '^VIX']}
  };
  const DESK_ORDER = ['all', 'stocks', 'forex', 'bonds', 'crypto', 'funds', 'futures', 'indices', 'economy', 'options', 'commodities'];
  const PANELS = {
    mkts: ['MKTS', 'Markets', 'mkts'], focus: ['GP', 'Chart', 'des'], heat: ['HEAT', 'Day change heat map'], fin: ['FA', 'Company financials', 'fa'], story: ['STORY', 'Today', 'macro'], intel: ['INTEL', 'FYNX Intelligence', 'intel'],
    top: ['TOP', 'Latest headlines', 'news'], desks: ['NEWS', 'Desks', 'news'], cb: ['CB', 'Central banks', 'macro'], curve: ['CURVE', 'Yield curve', 'macro'], vix: ['RISK', 'VIX, mood & crypto book', 'vol'], bias: ['BIAS', 'Smart Bias', 'bias'],
    edge: ['EDGE', 'Regimes', 'edge'], pos: ['COT', 'Futures positioning', 'edge'], eco: ['ECO', 'Economic calendar', 'cal'], corr: ['CORR', 'FX correlation'], tools: ['TOOLS', 'Your desk', 'calc'], movers: ['MOV', 'Top movers', 'mkts'],
    xa: ['XA', 'Cross-asset', 'mkts'], idx: ['IDX', 'Indices & sectors', 'mkts'], sess: ['SESS', 'Trading sessions'], earn: ['ERN', 'Earnings calendar', 'cal'], opt: ['OPT', 'Options', 'options'], optlist: ['OMON', 'Options monitor', 'options'],
    chain: ['CHAIN', 'Option chain', 'options'], active: ['MOST', 'Most active contracts', 'options'], term: ['VOL', 'Volatility', 'vol'], rates: ['RATES', 'Policy rates', 'macro'], gov: ['GOVT', 'Government yields', 'macro'], books: ['BOOK', 'Coinbase top of book'],
    range: ['RNG', 'Daily range', 'edge'], perf: ['PERF', 'Performance', 'mkts'], official: ['OFFL', 'Official releases', 'news']
  };
  const LINK_LABEL = {des: 'Full page', fa: 'Full', macro: 'Macro Desk', intel: 'All', news: 'All', vol: 'Vol', bias: 'Method', edge: 'Edge Radar', cal: 'Week', calc: 'All calcs', mkts: 'Board', options: 'Full'};

  const store = {get: k => { try { return localStorage.getItem('fx-term-' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('fx-term-' + k, v); } catch {} }};
  const S = {quotes: {}, quotesAt: null, prev: {}, desk: null, edge: null, calendar: null, schedule: null, briefing: [], desks: {}, vix: null, corr: {}, books: {}, history: {}, bars: {}, fin: {}, directory: null, journal: window.FynxTerminalJournal || {status: 'loading'},
    mk: null, opts: null, earn: null, sym: null, symData: {}, symQuotes: {}, symNews: {}, cards: {}, symbols: null, editing: false, deskKey: 'all', mktTab: null, mktSort: null, focus: 'SPY', range: 126, finTicker: 'AAPL', deskTab: 'forex', curve: 'US', ecoHigh: false, corrWindow: 60, tool: 'calc', optSym: 'SPY', optExp: 0, perfWin: 21, feeds: {}, paused: false};
  const $ = id => document.getElementById(id);
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  /* Symbol mode: picking one market reloads every box for it. Layouts per asset class. */
  const SYM_SLOTS = {
    stock: ['mkts', 'focus', 'squote', 'intel', 'snews', 'story', 'srisk', 'fin', 'earn', 'opt', 'cmp', 'desks', 'heat', 'eco', 'xa', 'tools'],
    fund: ['mkts', 'focus', 'squote', 'intel', 'snews', 'story', 'srisk', 'perf', 'opt', 'cmp', 'xa', 'desks', 'heat', 'eco', 'term', 'tools'],
    fx: ['mkts', 'focus', 'squote', 'intel', 'snews', 'story', 'srisk', 'bias', 'cb', 'eco', 'range', 'pos', 'corr', 'curve', 'sess', 'tools'],
    crypto: ['mkts', 'focus', 'squote', 'intel', 'snews', 'story', 'srisk', 'books', 'edge', 'pos', 'cmp', 'xa', 'desks', 'heat', 'eco', 'tools'],
    other: ['mkts', 'focus', 'squote', 'intel', 'snews', 'story', 'srisk', 'perf', 'cmp', 'xa', 'term', 'pos', 'desks', 'heat', 'eco', 'tools']
  };
  const D = () => S.sym ? symDef() : DESK_DEFS[S.deskKey];
  function symClass(symbol, type) {
    const t = String(type || '').toUpperCase();
    if (t === 'CURRENCY' || /=X$/.test(symbol) || (EDGE[symbol] && /^[A-Z]{6}$/.test(symbol) && !/^(XAU|XAG|BTC|ETH)/.test(symbol))) return 'fx';
    if (t === 'CRYPTOCURRENCY' || /-USD$/.test(symbol) || /^(BTC|ETH)USD$/.test(symbol)) return 'crypto';
    if (t === 'ETF' || t === 'MUTUALFUND' || /funds$/.test(info(symbol).group)) return 'fund';
    if (t === 'EQUITY' || info(symbol).group === 'Stocks') return 'stock';
    return 'other';
  }
  function symCurrencies(symbol) {
    const e = FX_TO_EDGE[symbol] || symbol, m = /^([A-Z]{3})([A-Z]{3})$/.exec(e);
    if (m) return [m[1], m[2]];
    const cur = S.symData[symbol]?.currency; return cur ? [cur.toUpperCase()] : ['USD'];
  }
  function symDef() {
    const s = S.sym, cls = s.cls, base = DESK_DEFS[{stock: 'stocks', fund: 'funds', fx: 'forex', crypto: 'crypto'}[cls]] || DESK_DEFS[S.deskKey] || DESK_DEFS.all, edgeId = FX_TO_EDGE[s.symbol] || (EDGE[s.symbol] ? s.symbol : null);
    const news = {fx: 'forex', crypto: 'crypto', fund: 'finance', stock: 'stocks'}[cls] || base.news;
    return {...base, label: shortOf(s.symbol), noun: s.name || s.symbol, who: `${shortOf(s.symbol)} traders`, slots: SYM_SLOTS[cls] || SYM_SLOTS.other, focus: s.symbol, storyKind: 'symbol', symbol: true,
      calc: {stock: 'shares', fund: 'shares', fx: 'fx', crypto: 'crypto'}[cls] || (FUTSPEC[s.symbol] ? 'futures' : base.calc), ccy: symCurrencies(s.symbol), edge: edgeId ? [edgeId] : base.edge, range: edgeId || base.range,
      opt: S.opts?.underlyings?.[s.symbol] ? s.symbol : base.opt, news, newsTabs: base.newsTabs?.includes(news) ? base.newsTabs : [news, ...(base.newsTabs || []).slice(0, 4)], heat: cls === 'crypto' ? ['Crypto'] : cls === 'fx' ? ['FX majors', 'FX crosses'] : base.heat || ['Stocks'], grid: null};
  }

  /* --- utilities --------------------------------------------------------- */
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = String(text); return n; }
  function safeHref(href) { try { const u = new URL(href, location.href); return ['https:', 'http:'].includes(u.protocol) ? u : null; } catch { return null; } }
  // Every link inside the terminal opens in a new tab, so the terminal itself is never replaced.
  function link(text, href, cls) { const u = safeHref(href); if (!u) return el('span', cls, text); const a = el('a', cls, text); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  function btn(text, cls, onClick, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', onClick); return b; }
  const signed = (v, d = 2, u = '') => finite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}${u}` : '—';
  const tone = v => !finite(v) || Math.abs(v) < 1e-9 ? 'fx-flat' : v > 0 ? 'fx-up' : 'fx-down';
  const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return !Number.isFinite(m) ? '' : m < 1 ? 'now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };
  const hhmm = iso => new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const day = iso => new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  const fmt = (v, d) => finite(v) ? v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}) : '—';
  const big = v => !finite(v) ? '—' : Math.abs(v) >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : Math.abs(v) >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + v.toFixed(2);
  const count = v => !finite(v) ? '—' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v).toLocaleString('en-US');
  const report = (op, e) => { try { window.FynxMonitor?.report('feed', 'terminal-' + op, e); } catch {} };
  const feed = (name, ok) => { S.feeds[name] = ok; renderLive(); };
  async function getJSON(url, {timeout = 25000, bust = false} = {}) {
    const target = bust ? url + (url.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / 120000) : url;
    const r = await fetch(target, {signal: AbortSignal.timeout(timeout), credentials: 'omit', referrerPolicy: 'no-referrer', headers: {Accept: 'application/json'}});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const t = await r.text(); if (t.length > 1.2e7) throw new Error('Too large');
    return JSON.parse(t);
  }
  async function research(path, check) {
    for (const base of RESEARCH) { try { const d = await getJSON(base + path, {bust: base.startsWith('https:')}); if (check(d)) return d; } catch (e) { report(path, e); } }
    return null;
  }
  const scratch = () => el('div');
  function panel(id) { const b = $('b-' + id); if (!b) return scratch(); b.replaceChildren(); return b; }
  const setText = (id, text) => { const n = $(id); if (n) n.textContent = text; };
  function tabs(hostId, items, current, onPick) {
    const host = $(hostId); if (!host) return; host.replaceChildren();
    for (const [value, label] of items) { const b = btn(label, value === current ? 'on' : '', () => onPick(value)); b.setAttribute('aria-pressed', String(value === current)); host.append(b); }
    // Narrow screens scroll the tab row sideways; keep the selected tab fully visible (row only, never the page).
    const on = host.querySelector('.on');
    if (on && host.scrollWidth > host.clientWidth) { const h = host.getBoundingClientRect(), o = on.getBoundingClientRect(); if (o.right > h.right) host.scrollLeft += o.right - h.right; else if (o.left < h.left) host.scrollLeft -= h.left - o.left; }
  }
  function rowButton(cls, onClick, label) { const r = el('button', 'fx-row ' + (cls || '')); r.type = 'button'; if (label) r.setAttribute('aria-label', label); r.addEventListener('click', onClick); return r; }
  const empty = (host, text) => host.append(el('p', 'fx-empty', text));
  const MKQ = () => S.mk?.quotes || {};
  const stat = id => MKQ()[id] || MKQ()[EDGE_TO_FX[id]] || null;
  function info(id) {
    const c = CATALOG.find(x => x.symbol === id); if (c) return {name: c.name, group: c.group === 'ETFs' ? stat(id)?.group || 'Equity funds' : c.group === 'FX' ? 'FX majors' : c.group};
    const q = MKQ()[id]; if (q) return {name: q.name, group: q.group};
    if (EDGE[id]) return {name: EDGE[id][0], group: 'Edge'};
    if (S.symQuotes[id]) return {name: S.symQuotes[id].name || id, group: S.symQuotes[id].group || ''};
    return {name: id, group: ''};
  }
  const nameOf = id => EDGE[id]?.[0] || info(id).name;
  function shortOf(id) {
    if (!id) return '';
    if (SHORT[id]) return SHORT[id];
    if (id.startsWith('^')) return id.slice(1);
    if (id.endsWith('=F')) return id.slice(0, -2);
    if (/^[A-Z]{6}=X$/.test(id)) return id.slice(0, 6);
    if (/^[A-Z]{3}=X$/.test(id)) return 'USD' + id.slice(0, 3);
    if (id.endsWith('-USD')) return id.slice(0, -4);
    return id;
  }
  function quoteFor(id) {
    const live = S.quotes[id] || S.quotes[EDGE_TO_FX[id]];
    if (!live && S.symQuotes[id]) return S.symQuotes[id];
    const q = stat(id);
    if (live) return q ? {...live, vol20: q.vol20, high52: q.high52, low52: q.low52, dayHigh: q.dayHigh, dayLow: q.dayLow, volume: q.volume, previousClose: q.previousClose} : live;
    return q ? {price: q.price, changePercent: q.changePercent, asOf: q.asOf, source: 'Yahoo Finance', delayed: true, snapshot: true, vol20: q.vol20, high52: q.high52, low52: q.low52, dayHigh: q.dayHigh, dayLow: q.dayLow, volume: q.volume, previousClose: q.previousClose} : null;
  }
  function digitsOf(id) {
    if (EDGE[id]) return EDGE[id][2];
    if (FX_TO_EDGE[id]) return EDGE[FX_TO_EDGE[id]][2];
    const g = info(id).group, p = quoteFor(id)?.price;
    if (g === 'Yields') return 3;
    if (/=X$/.test(id)) return finite(p) && p > 20 ? 3 : 4;
    if (finite(p) && p < 1) return 4;
    if (finite(p) && p < 10 && /=F$/.test(id)) return 3;
    return 2;
  }
  const universe = groups => {
    if (groups && !Array.isArray(groups)) return groups.syms.filter(s => MKQ()[s] || S.quotes[s]);
    const all = Object.values(MKQ()), fromSnap = groups.flatMap(g => all.filter(q => q.group === g).map(q => q.symbol));
    if (fromSnap.length) return fromSnap;
    const map = {Stocks: 'Stocks', Crypto: 'Crypto', 'FX majors': 'FX', 'Equity funds': 'ETFs', 'Sector funds': 'ETFs', 'Bond funds': 'ETFs', 'Commodity funds': 'ETFs'};
    return CATALOG.filter(c => groups.some(g => map[g] === c.group)).map(c => c.symbol);
  };
  const deskSymbols = () => [...new Set(D().mkts.flatMap(([, g]) => universe(g)))];
  const storySymbols = () => S.deskKey === 'options' ? Object.keys(S.opts?.underlyings || {}).filter(id => quoteFor(id)) : D().movers ? [...new Set(universe(D().movers))] : deskSymbols();

  /* --- inspector ---------------------------------------------------------- */
  function inspect(title, build) {
    const box = $('fx-inspect'), body = $('fx-inspect-body');
    $('fx-inspect-title').textContent = title; body.replaceChildren(); build(body); box.hidden = false; $('fx-inspect-close').focus();
  }
  const kv = (host, rows) => { const dl = el('dl', 'fx-kv'); for (const [k, v] of rows) { if (v === undefined || v === null || v === '') continue; dl.append(el('dt', '', k), typeof v === 'object' ? (() => { const dd = el('dd'); dd.append(v); return dd; })() : el('dd', '', v)); } host.append(dl); };
  $('fx-inspect-close').addEventListener('click', () => { $('fx-inspect').hidden = true; });

  /* --- loaders ------------------------------------------------------------ */
  async function loadQuotes() {
    try {
      const d = await getJSON(FN('webResearchData') + '?action=quotes&symbols=' + encodeURIComponent(CATALOG.map(c => c.symbol).join(',')));
      const next = {};
      for (const c of CATALOG) { const q = d?.quotes?.[c.symbol]; if (q && finite(q.price) && q.price > 0) next[c.symbol] = {price: q.price, changePercent: finite(q.changePercent) ? q.changePercent : null, asOf: q.asOf, source: q.source || 'Yahoo Finance', delayed: q.delayed !== false}; }
      if (!Object.keys(next).length) throw new Error('No quotes');
      S.prev = Object.fromEntries(Object.entries(S.quotes).map(([k, v]) => [k, v.price])); S.quotes = next; S.quotesAt = d.fetchedAt || new Date().toISOString(); feed('quotes', true);
    } catch (e) { report('quotes', e); feed('quotes', false); }
  }
  async function loadSnapshot(name, check) { try { const d = await getJSON(TDATA + name, {bust: true, timeout: 30000}); if (check(d)) return d; } catch (e) { report(name, e); } return null; }
  async function loadMarkets() { const d = await loadSnapshot('markets.json', d => d?.version === 1 && d.quotes && typeof d.quotes === 'object'); if (d) S.mk = d; feed('markets', Boolean(S.mk)); }
  async function loadOptions() { const d = await loadSnapshot('options.json', d => d?.version === 1 && d.underlyings); if (d) S.opts = d; feed('options', Boolean(S.opts)); }
  async function loadEarnings() { const d = await loadSnapshot('earnings.json', d => d?.version === 1 && Array.isArray(d.events)); if (d) S.earn = d; }
  async function loadDesk() { try { S.desk = M.validateDesk(await getJSON(DESK_URL, {bust: true})); feed('rates', true); } catch (e) { report('desk', e); feed('rates', false); } }
  async function loadEdge() { const d = await research('edge.json', d => Array.isArray(d?.markets)); if (d) S.edge = d; feed('edge', Boolean(S.edge)); }
  async function loadCalendar() { const d = await research('calendar.json', d => Array.isArray(d?.events)); if (d) S.calendar = d; feed('calendar', Boolean(S.calendar)); }
  async function loadSchedule() { if (!S.schedule) try { S.schedule = await getJSON('/assets/data/macro/central-banks.json'); } catch (e) { report('schedule', e); } }
  async function loadBriefing(force = false) { try { const r = await window.FynxTerminalData?.loadBriefing?.({force}); if (r?.items?.length) { S.briefing = r.items.slice(0, 80); feed('news', true); } else feed('news', false); } catch (e) { report('news', e); feed('news', false); } }
  async function loadNews(cat, force = false) {
    const N = window.FYNXMarketIntelligenceData; if (!N) return null;
    if (cat === 'all') { if (!S.briefing.length || force) await loadBriefing(force); return {items: S.briefing}; }
    if (!force && S.desks[cat] && Date.now() - S.desks[cat].at < 120000) return S.desks[cat];
    try { const r = await N.loadHeadlines(cat, {force, timeoutMs: 6500}); S.desks[cat] = {items: (r.items || []).slice(0, 60), fetchedAt: r.fetchedAt, status: r.status, at: Date.now()}; window.FYNXNewsReaderData?.remember?.(S.desks[cat].items); } catch (e) { report('news-' + cat, e); }
    return S.desks[cat] || null;
  }
  async function loadVix() { try { S.vix = await getJSON(FN('webMarketAnalytics') + '?kind=vix'); feed('vix', true); } catch (e) { report('vix', e); feed('vix', false); } }
  async function loadCorr(w = S.corrWindow) { try { S.corr[w] = await getJSON(FN('webMarketAnalytics') + '?kind=correlation&window=' + w); } catch (e) { report('corr', e); } }
  async function loadBooks(list = ['BTC-USD', 'ETH-USD']) {
    await Promise.allSettled(list.map(async p => { try { S.books[p] = await getJSON(FN('webMarketAnalytics') + '?kind=liquidity&product=' + p, {timeout: 15000}); } catch (e) { report('book', e); } }));
  }
  async function loadSeries(id) {
    if (EDGE[id]) {
      if (!S.bars[id]) { const d = await research(`bars/${id}-D1.json`, d => d?.symbol === id && Array.isArray(d.bars)); if (d) S.bars[id] = {source: d.source || 'Dukascopy', raw: d.bars, rows: d.bars.filter(b => ![0, 6].includes(new Date(b.time).getUTCDay()) || /BTC|ETH/.test(id)).map(b => ({date: b.time.slice(0, 10), open: b.open, high: b.high, low: b.low, close: b.close}))}; }
      return S.bars[id] || null;
    }
    if (!S.history[id] && CATALOG.some(c => c.symbol === id)) { try { const d = await getJSON(FN('webResearchData') + '?action=history&symbol=' + encodeURIComponent(id), {timeout: 30000}); if (Array.isArray(d?.bars) && d.bars.length) S.history[id] = {source: d.source || 'Yahoo Finance', rows: d.bars}; } catch (e) { report('history', e); } }
    if (!S.history[id] && MKQ()[id]?.history?.length) S.history[id] = {source: 'Yahoo Finance (snapshot)', closeOnly: true, rows: MKQ()[id].history.map(([date, close]) => ({date, close}))};
    return S.history[id] || null;
  }
  async function loadDirectory() { if (!S.directory) { try { const d = await getJSON(FN('webResearchData') + '?action=directory', {timeout: 30000}); S.directory = d.companies || []; } catch (e) { report('directory', e); } } return S.directory || []; }
  async function loadFin(ticker, cik) {
    const key = cik ? 'cik' + cik : ticker;
    if (S.fin[key]) return S.fin[key];
    try {
      if (!cik) { const dir = await loadDirectory(); const symbol = ticker.replace('-', '.'), company = dir.find(c => c.symbol === ticker || c.symbol === symbol); if (!company) return null; cik = company.cik; }
      S.fin[key] = await getJSON(FN('webResearchData') + '?action=financials&cik=' + cik, {timeout: 30000});
      return S.fin[key];
    } catch (e) { report('fin', e); return null; }
  }

  /* --- header: clocks, live, quotes strip, news ticker ---------------------- */
  function zoneState(tz, open, close, now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit'}).formatToParts(now).map(p => [p.type, p.value]));
    const h = Number(parts.hour) + Number(parts.minute) / 60, weekend = ['Sat', 'Sun'].includes(parts.weekday);
    return {time: `${parts.hour}:${parts.minute}`, open: !weekend && h >= open && h < close, weekday: parts.weekday, hour: h};
  }
  const sessionState = ([code, name, tz, open, close], now) => ({code, name, ...zoneState(tz, open, close, now)});
  function renderClocks() {
    const host = $('fx-clocks'); host.replaceChildren();
    for (const s of SESSIONS) { const st = sessionState(s), span = el('span', 'fx-clock'); span.append(el('b', '', st.code), el('span', '', st.time), el('em', st.open ? 'fx-up' : 'fx-dim', st.open ? 'OPEN' : 'CLOSED')); span.title = `${st.name} session ${st.open ? 'open' : 'closed'} (local ${st.time})`; host.append(span); }
  }
  function renderLive() {
    const ok = Object.values(S.feeds).filter(Boolean).length, total = Object.keys(S.feeds).length, live = $('fx-live');
    live.lastChild.textContent = total ? `LIVE · ${ok}/${total} FEEDS` : 'CONNECTING';
    live.className = 'fx-live' + (total && ok < total ? ' fx-warn' : '');
    live.title = Object.entries(S.feeds).map(([k, v]) => `${k}: ${v ? 'ok' : 'unavailable'}`).join(' · ') + ' · click for sources';
  }
  function stripSymbols() {
    const d = D();
    if (S.deskKey === 'all') return TICKER;
    return [...new Set([...(d.anchors || []).map(a => a[0]), ...(d.xa || []), ...deskSymbols().slice(0, 10)])];
  }
  function renderStrip() {
    const host = $('fx-quotes'); host.replaceChildren();
    const ten = S.desk?.liveUS?.quotes?.find(q => q.tenor === '10Y');
    if (ten) { const b = btn('', 'fx-q', () => setCurve('US')); b.append(el('b', '', 'US10Y'), el('span', '', ten.price.toFixed(3) + '%'), el('em', tone(ten.price - ten.previousClose), signed((ten.price - ten.previousClose) * 100, 1, 'bp'))); host.append(b); }
    for (const id of stripSymbols()) {
      const q = quoteFor(id); if (!q || id === '^TNX') continue;
      const b = btn('', 'fx-q', () => focusOn(id), `${nameOf(id)} ${q.price}`); b.append(el('b', '', shortOf(id)), el('span', '', fmt(q.price, digitsOf(id))), el('em', tone(q.changePercent), finite(q.changePercent) ? (q.changePercent >= 0 ? '▲ ' : '▼ ') + Math.abs(q.changePercent).toFixed(2) + '%' : ''));
      host.append(b);
    }
    const t = S.deskKey === 'all' ? S.quotesAt : S.mk?.generatedAt;
    if (t) host.append(el('span', 'fx-dim', `Delayed quotes · ${hhmm(t)}`));
  }
  function renderNews() {
    const track = $('fx-news-track'); track.replaceChildren();
    const cat = D().news, items = (cat === 'all' ? S.briefing : S.desks[cat]?.items?.length ? S.desks[cat].items : S.briefing).slice(0, 18);
    if (!items.length) { track.append(el('span', 'fx-dim', 'Headlines are temporarily unavailable.')); track.classList.remove('run'); return; }
    for (const copy of [0, 1]) for (const h of items) { const a = btn('', 'fx-hl', () => openPage('article', h)); if (copy) { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); } a.append(el('time', '', hhmm(h.publishedAt)), el('strong', '', h.title), el('span', '', h.source)); track.append(a); }
    track.style.setProperty('--dur', Math.max(60, items.length * 8) + 's'); track.classList.add('run');
  }

  /* --- quote rows (shared by MKTS, IDX, XA, MOV) ------------------------------- */
  function quoteRow(id, extra, onPick) {
    const q = quoteFor(id), r = rowButton('fx-r3' + (S.focus === id || S.focus === FX_TO_EDGE[id] ? ' sel' : ''), onPick || (() => focusOn(id)), onPick ? `Load the desk for ${nameOf(id)}` : `Chart ${nameOf(id)}`);
    const flash = q && finite(S.prev[id]) && S.prev[id] !== q.price ? (q.price > S.prev[id] ? ' fx-flash-up' : ' fx-flash-dn') : '';
    const n = el('span', 'fx-sym'); n.append(el('b', '', shortOf(id)), el('small', '', extra || nameOf(id)));
    r.append(n, el('span', 'fx-num' + flash, q ? fmt(q.price, digitsOf(id)) : '—'), el('span', 'fx-num ' + tone(q?.changePercent), q ? signed(q.changePercent, 2, '%') : '—'));
    return r;
  }
  function renderMkts() {
    const d = D(), groups = d.mkts, all = groups.length > 1 ? [['ALL', {syms: [...new Set(groups.flatMap(g => universe(g[1])))]}], ...groups] : groups;
    if (!all.some(t => t[0] === S.mktTab)) S.mktTab = all[0][0];
    setText('t-mkts', d.noun);
    tabs('mkts-tabs', all.map(t => [t[0], t[0]]), S.mktTab, v => { S.mktTab = v; renderMkts(); });
    const host = panel('mkts');
    let list = universe(all.find(t => t[0] === S.mktTab)[1]);
    if (S.sym && !list.includes(S.sym.symbol) && !list.includes(EDGE_TO_FX[S.sym.symbol])) list = [S.sym.symbol, ...list];
    if (S.mktSort) list = [...list].sort((a, b) => (quoteFor(b)?.changePercent ?? -999) * S.mktSort - (quoteFor(a)?.changePercent ?? -999) * S.mktSort);
    const head = el('div', 'fx-th'); head.append(el('span', '', 'SYMBOL'), el('span', '', 'LAST'), btn(S.mktSort === 1 ? 'CHG ▼' : S.mktSort === -1 ? 'CHG ▲' : 'CHG ↕', 'fx-sort', () => { S.mktSort = S.mktSort === 1 ? -1 : S.mktSort === -1 ? null : 1; renderMkts(); }, 'Sort by change')); host.append(head);
    if (!list.length) return empty(host, 'Loading quotes…');
    for (const id of list) host.append(quoteRow(id, null, () => setSymbol({symbol: id})));
    const src = list.some(id => S.quotes[id]) ? 'Live delayed quotes refresh every 30 s; others' : 'Delayed quotes';
    host.append(el('p', 'fx-foot', `${src} from the ${S.mk ? hhmm(S.mk.generatedAt) : ''} market snapshot (Yahoo Finance, exchange delays apply).`));
  }
  function renderList(kind, ids, foot) {
    const host = panel(kind);
    if (!ids.length) return empty(host, 'Loading quotes…');
    const head = el('div', 'fx-th'); head.append(el('span', '', 'SYMBOL'), el('span', '', 'LAST'), el('span', '', 'CHG')); host.append(head);
    ids.forEach(id => host.append(quoteRow(id)));
    if (foot) host.append(el('p', 'fx-foot', foot));
  }
  function renderXA() {
    const ids = (D().xa || []).filter(id => quoteFor(id));
    setText('t-xa', `Cross-asset vs ${D().noun.toLowerCase()}`);
    renderList('xa', ids);
    const host = $('b-xa'); if (!host || !ids.length) return;
    const risk = ['^GSPC', '^NDX', 'BTC-USD'].map(id => quoteFor(id)?.changePercent).filter(finite), safe = ['GC=F', '^TNX'].map(id => quoteFor(id)?.changePercent).filter(finite);
    if (risk.length) { const r = risk.reduce((s, v) => s + v, 0) / risk.length; host.append(el('p', 'fx-foot', `Risk assets average ${signed(r, 2, '%')} today${safe.length ? `; gold and the 10-year yield ${safe.map(v => signed(v, 2, '%')).join(' / ')}` : ''}.`)); }
  }
  function renderIdx() { const d = D(); setText('t-idx', d.idx?.title || 'Indices & sectors'); renderList('idx', universe(d.idx?.groups || ['Americas'])); }
  function renderMovers() {
    const host = panel('movers'), ids = (D().movers ? universe(D().movers) : deskSymbols()).filter(id => finite(quoteFor(id)?.changePercent));
    if (!ids.length) return empty(host, 'Waiting for quotes…');
    const sorted = [...ids].sort((a, b) => quoteFor(b).changePercent - quoteFor(a).changePercent), n = Math.min(6, Math.floor(sorted.length / 2));
    const up = ids.filter(id => quoteFor(id).changePercent > 0).length; setText('n-movers', `${up} up · ${ids.length - up} down`);
    const cols = el('div', 'fx-movers');
    for (const [label, list] of [['GAINERS', sorted.slice(0, n)], ['LOSERS', sorted.slice(-n).reverse()]]) {
      const col = el('div'); col.append(el('div', 'fx-th1', label));
      list.forEach(id => { const q = quoteFor(id), z = finite(q.vol20) && q.vol20 > 0 ? Math.abs(q.changePercent) / q.vol20 : null; const r = rowButton('fx-mv', () => focusOn(id), `${nameOf(id)} ${signed(q.changePercent, 2, '%')}`); r.append(el('b', '', shortOf(id)), el('span', 'fx-num ' + tone(q.changePercent), signed(q.changePercent, 2, '%')), el('small', 'fx-dim', z ? z.toFixed(1) + 'σ' : '')); col.append(r); });
      cols.append(col);
    }
    host.append(cols, el('p', 'fx-foot', 'σ = today’s move vs its own 20-day typical daily move.'));
  }
  function renderHeat() {
    const host = panel('heat'), ids = universe(D().heat || ['Stocks']).filter(id => finite(quoteFor(id)?.changePercent));
    if (!ids.length) return empty(host, 'Waiting for quotes…');
    const up = ids.filter(id => quoteFor(id).changePercent > 0).length;
    setText('n-heat', `${up} up · ${ids.length - up} down`);
    const grid = el('div', 'fx-heat');
    for (const id of ids) {
      const v = quoteFor(id).changePercent, a = Math.min(1, Math.abs(v) / 3);
      const t = btn('', 'fx-tile', () => focusOn(id), `${nameOf(id)} ${signed(v, 2, '%')}`);
      t.style.background = v >= 0 ? `rgba(46,160,90,${0.15 + a * 0.75})` : `rgba(214,69,58,${0.15 + a * 0.75})`;
      t.append(el('b', '', shortOf(id)), el('span', '', signed(v, 2, '%'))); grid.append(t);
    }
    host.append(grid);
  }
  /* Period returns from daily closes (snapshot history). */
  function periodReturn(id, sessions) {
    const h = stat(id)?.history; if (!h || h.length < 2) return null;
    if (sessions === 'ytd') { const y = new Date().getUTCFullYear() + '-01-01', base = [...h].reverse().find(r => r[0] < y); return base ? (h.at(-1)[1] / base[1] - 1) * 100 : null; }
    if (h.length <= sessions) return null;
    return (h.at(-1)[1] / h.at(-1 - sessions)[1] - 1) * 100;
  }
  function renderPerf() {
    tabs('perf-tabs', [[5, '1W'], [21, '1M'], [63, '3M'], ['ytd', 'YTD'], [251, '1Y']], S.perfWin, v => { S.perfWin = v; renderPerf(); });
    const host = panel('perf'), ids = (D().perf ? universe(D().perf) : deskSymbols()).map(id => ({id, r: periodReturn(id, S.perfWin)})).filter(x => finite(x.r)).sort((a, b) => b.r - a.r);
    if (!ids.length) return empty(host, 'Loading history…');
    const max = Math.max(...ids.map(x => Math.abs(x.r)), 1);
    for (const {id, r} of ids) {
      const row = rowButton('fx-perf', () => focusOn(id), `${nameOf(id)} ${signed(r, 2, '%')}`);
      const bar = el('span', 'fx-bbar'), fill = el('i', r >= 0 ? 'up' : 'dn'), w = Math.abs(r) / max * 50; fill.style.width = w + '%'; fill.style.left = (r >= 0 ? 50 : 50 - w) + '%'; bar.append(el('b'), fill);
      const n = el('span', 'fx-sym'); n.append(el('b', '', shortOf(id)), el('small', '', nameOf(id)));
      row.append(n, bar, el('span', 'fx-num ' + tone(r), signed(r, 1, '%'))); host.append(row);
    }
    host.append(el('p', 'fx-foot', 'Total price change over the window from daily closes (dividends excluded).'));
  }

  /* --- FOCUS chart ---------------------------------------------------------- */
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
  function resolve(input) {
    const raw = String(input || '').trim().toUpperCase().replace(/\s+/g, '').replace('/', '');
    if (!raw) return null;
    if (ALIASES[raw]) return ALIASES[raw];
    if (EDGE[raw]) return raw;
    const c = CATALOG.find(x => x.symbol === raw || shortOf(x.symbol) === raw);
    if (c) return FX_TO_EDGE[c.symbol] || c.symbol;
    const q = Object.keys(MKQ()).find(s => s === raw || shortOf(s) === raw);
    if (q) return FX_TO_EDGE[q] || q;
    return null;
  }
  /* Line chart with crosshair readout; rows: [{date, close, open?, high?, low?}]. */
  function lineChart(rows, {digits = 2, W = 640, H = 230, label = '', source = '', last = null} = {}) {
    const wrap = el('div', 'fx-chartwrap');
    const closes = rows.map(r => r.close), endV = finite(last) ? last : closes.at(-1), first = closes[0];
    const L = 6, R = 58, T = 10, B = 22, min = Math.min(...closes, endV), max = Math.max(...closes, endV), pad = (max - min) * 0.08 || Math.abs(max) * 0.01 || 1;
    const x = i => L + i * (W - L - R) / Math.max(1, rows.length - 1), y = v => T + (max + pad - v) / (max - min + 2 * pad) * (H - T - B);
    const chart = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart', role: 'img', 'aria-label': `${label} daily closes over ${rows.length} sessions, from ${fmt(first, digits)} to ${fmt(closes.at(-1), digits)}`});
    for (let k = 0; k <= 4; k++) { const v = min - pad + (max - min + 2 * pad) * k / 4; chart.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: W - R + 6, y: y(v) + 4, class: 'a'}); t.textContent = fmt(v, digits); chart.append(t); }
    const pts = closes.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), upTrend = endV >= first;
    chart.append(svg('polygon', {points: `${L},${H - B} ${pts} ${x(rows.length - 1)},${H - B}`, class: upTrend ? 'fa-up' : 'fa-dn'}), svg('polyline', {points: pts, class: upTrend ? 'ln-up' : 'ln-dn', fill: 'none'}));
    [0, Math.floor(rows.length / 2), rows.length - 1].forEach((i, k) => { const t = svg('text', {x: x(i), y: H - 6, class: 'a', 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}); t.textContent = day(rows[i].date); chart.append(t); });
    const cross = svg('line', {class: 'cx', y1: T, y2: H - B, x1: -10, x2: -10}), dot = svg('circle', {r: 3.5, class: 'cd', cx: -10, cy: -10}); chart.append(cross, dot);
    const ohlc = rows.some(r => finite(r.open) && finite(r.high));
    const read = el('p', 'fx-readout', `Hover the chart for values · ${source}`);
    chart.addEventListener('pointermove', e => {
      const box = chart.getBoundingClientRect(), px = (e.clientX - box.left) / box.width * W, i = Math.max(0, Math.min(rows.length - 1, Math.round((px - L) / (W - L - R) * (rows.length - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(closes[i]));
      const r = rows[i]; read.textContent = `${r.date} · ${ohlc ? `O ${fmt(r.open, digits)} H ${fmt(r.high, digits)} L ${fmt(r.low, digits)} ` : ''}C ${fmt(r.close, digits)} · ${signed((r.close / first - 1) * 100, 2, '%')} vs start`;
    });
    wrap.append(chart, read);
    return wrap;
  }
  async function focusOn(input, {quiet = false} = {}) {
    const id = resolve(input) || input; S.focus = FX_TO_EDGE[id] || id;
    if (info(S.focus).group === 'Stocks' || CATALOG.find(c => c.symbol === S.focus && c.group === 'Stocks')) { S.finTicker = S.focus; renderFin(); }
    if (S.opts?.underlyings?.[S.focus]) { S.optSym = S.focus; S.optExp = 0; R('opt', 'chain', 'active', 'optlist'); }
    R('mkts', 'xa', 'idx'); renderFocus();
    if (!$('tp-focus') && !quiet) { openPage('des', S.focus); return; }
    if (!quiet && window.innerWidth < 1100) $('tp-focus')?.scrollIntoView({behavior: 'smooth', block: 'start'});
    await loadSeries(S.focus); renderFocus();
  }
  function renderFocus() {
    const id = S.focus, series = EDGE[id] ? S.bars[id] : S.history[id], digits = digitsOf(id);
    setText('t-focus', `${shortOf(id)} · ${nameOf(id)}`);
    tabs('focus-tabs', [[21, '1M'], [63, '3M'], [126, '6M'], [252, '1Y'], [504, '2Y']], S.range, v => { S.range = v; renderFocus(); });
    const host = panel('focus');
    if (!series?.rows?.length) return empty(host, 'Loading daily history…');
    const rows = series.rows.slice(-S.range), closes = rows.map(r => r.close), q = quoteFor(id);
    const last = q?.price ?? closes.at(-1), first = closes[0], hi = Math.max(...rows.map(r => r.high ?? r.close)), lo = Math.min(...rows.map(r => r.low ?? r.close));
    const yr = series.rows.slice(-252), hi52 = q?.high52 ?? Math.max(...yr.map(r => r.high ?? r.close)), lo52 = q?.low52 ?? Math.min(...yr.map(r => r.low ?? r.close));
    const stats = el('div', 'fx-stats');
    const st = (k, v, cls) => { const s = el('div'); s.append(el('span', '', k), el('b', cls || '', v)); stats.append(s); };
    st('LAST', fmt(last, digits)); st('DAY', q ? signed(q.changePercent, 2, '%') : '—', tone(q?.changePercent)); st('PERIOD', signed((last / first - 1) * 100, 2, '%'), tone(last - first));
    st('RANGE HI', fmt(hi, digits)); st('RANGE LO', fmt(lo, digits)); st('52W HI', fmt(hi52, digits)); st('52W LO', fmt(lo52, digits));
    if (finite(q?.vol20)) st('20D VOL', q.vol20.toFixed(2) + '%/d');
    host.append(stats, lineChart(rows, {digits, label: nameOf(id), last, source: `${series.source} daily ${EDGE[id] ? 'bid candles' : series.closeOnly ? 'closes' : 'adjusted closes'}`}));
    const extra = el('div', 'fx-focus-extra'), edgeM = S.edge?.markets?.find(m => m.symbol === id), tag = el('div', 'fx-chips');
    if (edgeM) {
      const pair = M.PAIRS.find(p => p.id === id) || {id, base: null, quote: null};
      const b = M.smartBias(pair, {desk: S.desk, edgeMarket: edgeM, livePrice: q?.price});
      tag.append(el('span', 'fx-chip', `Regime ${edgeM.state?.regime?.value || '—'}`), el('span', 'fx-chip', `Vol ${M.ordinal(Math.round(edgeM.state?.volatilityPercentile?.value ?? 0))} pct`), el('span', 'fx-chip ' + tone(edgeM.positioning?.net?.value), `COT ${signed((edgeM.positioning?.net?.value ?? 0) * 100, 0, '%')}${edgeM.positioning?.crowded?.value ? ' crowded' : ''}`));
      if (finite(b.score)) tag.append(el('span', 'fx-chip ' + (b.score >= 15 ? 'fx-up' : b.score <= -15 ? 'fx-down' : ''), `Bias ${b.label} ${b.score > 0 ? '+' : ''}${b.score}`));
      tag.append(btn('Edge detail ▸', 'fx-chip fx-chip-link', () => openPage('edge', id)), link('Backtest ↗︎', `/quant-analyst.html?symbol=${id}`, 'fx-chip fx-chip-link'));
    }
    tag.append(btn('Full page ▸', 'fx-chip fx-chip-link', () => openPage('des', id)));
    if (info(id).group === 'Stocks') tag.append(btn('Financials ▸', 'fx-chip fx-chip-link', () => openPage('fa', id)));
    if (S.opts?.underlyings?.[id]) tag.append(btn('Options ▸', 'fx-chip fx-chip-link', () => openPage('options', id)));
    tag.append(btn('Compare & draw ▸', 'fx-chip fx-chip-link', () => openPage('chart', EDGE_TO_FX[id] && !S.bars[id] ? EDGE_TO_FX[id] : id)));
    if (!S.sym || S.sym.symbol !== id) tag.prepend(btn(`Load every box for ${shortOf(id)} ▸`, 'fx-chip fx-chip-link pg-primary', () => setSymbol({symbol: id})));
    tag.append(btn('News ▸', 'fx-chip fx-chip-link', () => openPage('news', {q: shortOf(id), name: nameOf(id)})));
    extra.append(tag); host.append(extra);
  }

  /* --- FIN ------------------------------------------------------------------ */
  const FIN_ROWS = [['revenue', 'Revenue'], ['income', 'Net income'], ['eps', 'Diluted EPS'], ['operatingCash', 'Operating cash'], ['capex', 'Capex'], ['cash', 'Cash'], ['assets', 'Assets'], ['liabilities', 'Liabilities'], ['equity', 'Equity'], ['longTermDebt', 'LT debt']];
  function finTable(f, t, periods) {
    const table = el('table', 'fx-table'), thead = el('tr'); thead.append(el('th', '', 'FY END')); periods.forEach(p => thead.append(el('th', '', p.slice(0, 7)))); table.append(thead);
    const keys = [...new Set([...FIN_ROWS.map(r => r[0]), ...periods.flatMap(p => Object.keys(f.annual[p] || {}))])];
    for (const id of keys) {
      if (!periods.some(p => f.annual[p]?.[id])) continue;
      const label = FIN_ROWS.find(r => r[0] === id)?.[1] || id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
      const tr = el('tr'); tr.append(el('th', '', label));
      periods.forEach(p => { const fact = f.annual[p]?.[id], td = el('td', 'fx-num'); if (fact) { const perShare = /eps|PerShare/i.test(id); td.append(btn(perShare ? '$' + fact.value.toFixed(2) : big(fact.value), 'fx-cell', () => inspect(`${t} ${label} · FY ${p}`, h => kv(h, [['Value', perShare ? '$' + fact.value : '$' + fact.value.toLocaleString('en-US')], ['Period', `${fact.start || ''} → ${fact.end}`], ['Filed', fact.filed], ['XBRL tag', fact.tag], ['Filing', link('Open on SEC ↗︎', `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${f.cik}&type=10-K`)]])))); } else td.textContent = '—'; tr.append(td); });
      table.append(tr);
    }
    if (periods.some(p => f.annual[p]?.revenue && f.annual[p]?.income)) { const tr = el('tr'); tr.append(el('th', '', 'Net margin')); periods.forEach(p => { const a = f.annual[p]; tr.append(el('td', 'fx-num', a?.revenue && a?.income ? (a.income.value / a.revenue.value * 100).toFixed(1) + '%' : '—')); }); table.append(tr); }
    return table;
  }
  async function renderFin() {
    if (!$('tp-fin')) return;
    const t = S.finTicker; setText('t-fin', `${t} · annual SEC filings`);
    const host = panel('fin'); empty(host, 'Loading SEC filings…');
    const f = await loadFin(t); if (t !== S.finTicker) return;
    host.replaceChildren();
    if (!f?.periods?.length) return empty(host, 'Financial statements are not available from SEC EDGAR for this company right now.');
    host.append(el('p', 'fx-sub', `${f.name} · CIK ${f.cik}`), finTable(f, t, f.periods.slice(0, 4)), el('p', 'fx-foot', 'Annual 10-K facts from SEC EDGAR · click a value for its filing.'));
  }

  /* --- STORY ------------------------------------------------------------------ */
  function nextEvents(ccy, n = 2) {
    const now = Date.now();
    return (S.calendar?.events || []).filter(e => e.impact === 'high' && Date.parse(e.time) > now && (!ccy || ccy.includes(e.currency))).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).slice(0, n);
  }
  function deskStory() {
    const d = D(), ids = storySymbols().filter(id => finite(quoteFor(id)?.changePercent));
    if (!ids.length) return {available: false};
    const ch = id => quoteFor(id).changePercent, up = ids.filter(id => ch(id) > 0).length, avg = ids.reduce((s, id) => s + ch(id), 0) / ids.length;
    const zs = id => { const q = quoteFor(id); return finite(q.vol20) && q.vol20 > 0 ? Math.abs(q.changePercent) / q.vol20 : Math.abs(q.changePercent); };
    const lead = [...ids].sort((a, b) => zs(b) - zs(a))[0], sorted = [...ids].sort((a, b) => ch(b) - ch(a)), noun = S.deskKey === 'options' ? 'Option underlyings' : d.noun;
    const dir = avg > 0.25 ? 'higher' : avg < -0.25 ? 'lower' : 'mixed';
    const title = `${noun} ${dir}: ${shortOf(lead)} ${ch(lead) >= 0 ? 'up' : 'down'} ${Math.abs(ch(lead)).toFixed(1)}%`;
    const lines = [];
    lines.push(`${up} of ${ids.length} ${noun.toLowerCase()} on this desk are up, average ${signed(avg, 2, '%')}. Leaders: ${sorted.slice(0, 2).map(id => `${shortOf(id)} ${signed(ch(id), 2, '%')}`).join(', ')}; laggards: ${sorted.slice(-2).reverse().map(id => `${shortOf(id)} ${signed(ch(id), 2, '%')}`).join(', ')}.`);
    const anchors = (d.anchors || []).filter(([id]) => quoteFor(id)).map(([id, label]) => `${label} ${fmt(quoteFor(id).price, digitsOf(id))} (${signed(quoteFor(id).changePercent, 2, '%')})`);
    if (anchors.length) lines.push(anchors.join(', ') + '.');
    if (S.deskKey === 'options' && S.opts?.underlyings?.SPY) { const u = S.opts.underlyings.SPY, e = u.expiries.find(x => x.dte >= 1) || u.expiries[0]; lines.push(`SPY 30-day implied volatility is ${u.iv30?.toFixed(1)}% with a put/call volume ratio of ${u.putCallVolume?.toFixed(2)}; options price a ±${e?.movePercent?.toFixed(2)}% move by ${day(e.date)}.`); }
    const ten = S.desk?.liveUS?.quotes?.find(q => q.tenor === '10Y'); if (ten) lines.push(`The US 10-year yield is ${ten.price.toFixed(2)}% (${signed((ten.price - ten.previousClose) * 100, 0, ' bp')}).`);
    const odds = S.desk?.fed?.odds; if (odds) { const best = [['cut50', 'a 50 bp cut'], ['cut', 'a 25 bp cut'], ['hold', 'no change'], ['hike', 'a 25 bp hike'], ['hike50', 'a 50 bp hike']].sort((a, b) => odds[b[0]] - odds[a[0]])[0]; lines.push(`Fed funds futures price ${best[1]} on ${day(odds.meeting)} (${Math.round(odds[best[0]])}%).`); }
    if (S.deskKey === 'stocks' && S.earn?.events?.length) { const soon = S.earn.events.filter(e => e.date >= new Date().toISOString().slice(0, 10)).slice(0, 3); if (soon.length) lines.push(`Earnings next: ${soon.map(e => `${e.symbol} ${day(e.date)} ${e.time === 'After close' ? 'after close' : e.time === 'Before open' ? 'before open' : ''}`.trim()).join(', ')}.`); }
    const ev = nextEvents(d.ccy); if (ev.length) lines.push(`Next on the calendar: ${ev.map(e => `${e.currency} ${e.title} ${new Date(e.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})}`).join('; ')}.`);
    const metric = d.metric && quoteFor(d.metric);
    const facts = [{label: 'BREADTH', value: `${up} / ${ids.length - up}`, note: 'up / down', act: () => openPage('mkts')}, {label: 'BIGGEST MOVE', value: `${shortOf(lead)} ${signed(ch(lead), 1, '%')}`, note: nameOf(lead), act: () => focusOn(lead)}];
    if (metric) facts.push({label: shortOf(d.metric), value: fmt(metric.price, digitsOf(d.metric)), note: signed(metric.changePercent, 2, '%'), act: () => focusOn(d.metric)});
    return {available: true, title, lines, facts};
  }
  function renderStory() {
    const host = panel('story'), d = D();
    if (S.sym) return renderSymStory(host);
    setText('t-story', `${S.deskKey === 'all' ? 'Today' : d.noun + ' today'} · ${new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}`);
    if (d.storyKind === 'macro') {
      const rows = M.PAIRS.map(p => M.smartBias(p, {desk: S.desk, edgeMarket: S.edge?.markets?.find(m => m.symbol === p.id), livePrice: quoteFor(p.id)?.price}));
      const s = M.composeStory({desk: S.desk, banks: S.schedule?.banks || [], headlines: S.briefing, bias: rows});
      if (!s.available) return empty(host, 'Waiting for rate data…');
      host.append(el('h3', 'fx-h3', s.title), el('p', 'fx-story', s.lines.join(' ')));
      const facts = el('div', 'fx-facts');
      for (const f of s.facts) { const b = btn('', 'fx-fact', () => f.label === 'US 10-year' ? setCurve('US') : f.label === 'Next decision' ? openPage('cb', S.schedule.banks.find(x => x.short === f.value)?.short) : focusOn(f.value), f.label); b.append(el('span', '', f.label), el('b', '', f.value), el('small', '', f.note)); facts.append(b); }
      return host.append(facts);
    }
    const s = deskStory();
    if (!s.available) return empty(host, 'Waiting for quotes…');
    host.append(el('h3', 'fx-h3', s.title), el('p', 'fx-story', s.lines.join(' ')));
    const facts = el('div', 'fx-facts');
    for (const f of s.facts) { const b = btn('', 'fx-fact', f.act, f.label); b.append(el('span', '', f.label), el('b', '', f.value), el('small', '', f.note)); facts.append(b); }
    host.append(facts, el('p', 'fx-foot', 'Written from live quotes, rates and the calendar on this desk. Not advice.'));
  }

  /* --- NEWS --------------------------------------------------------------- */
  function headlineRow(h) {
    const a = rowButton('fx-hrow', () => openPage('article', h), h.title); a.append(el('time', '', hhmm(h.publishedAt)), el('span', 'fx-ht', h.title), el('small', '', `${h.source}${h.kind === 'official-release' ? ' · OFFICIAL' : ''}`)); return a;
  }
  async function renderTop() {
    const d = D(), cat = d.news;
    setText('t-top', cat === 'all' ? 'Latest headlines' : `${NEWS_CATS.find(n => n[0] === cat)?.[1] || cat} headlines`);
    const host = panel('top');
    if (cat !== 'all' && !S.desks[cat]) { empty(host, 'Loading headlines…'); await loadNews(cat); if (D().news !== cat || !$('b-top')) return; host.replaceChildren(); }
    const items = cat === 'all' ? S.briefing : S.desks[cat]?.items || [];
    if (!items.length) return empty(host, cat === 'all' ? 'Loading headlines…' : 'No current stories for this desk.');
    items.slice(0, 40).forEach(h => host.append(headlineRow(h)));
  }
  async function renderDesks(load = false) {
    const list = D().newsTabs, items = NEWS_CATS.filter(([k]) => list.includes(k));
    if (!list.includes(S.deskTab)) S.deskTab = list[0];
    tabs('desks-tabs', items, S.deskTab, v => { S.deskTab = v; renderDesks(true); });
    const host = panel('desks'), cat = S.deskTab;
    if (load || !S.desks[cat]) { empty(host, 'Loading desk…'); await loadNews(cat); if (cat !== S.deskTab || !$('b-desks')) return; host.replaceChildren(); }
    const dd = S.desks[cat];
    if (!dd?.items?.length) return empty(host, 'No current stories for this desk. Try another desk.');
    dd.items.forEach(h => host.append(headlineRow(h)));
  }
  function renderOfficial() {
    const host = panel('official'), items = S.briefing.filter(h => h.kind === 'official-release');
    if (!items.length) return empty(host, S.briefing.length ? 'No official releases in the current feed.' : 'Loading official releases…');
    items.slice(0, 30).forEach(h => host.append(headlineRow(h)));
    host.append(el('p', 'fx-foot', 'Statistics agencies and central banks, straight from their official feeds.'));
  }

  /* --- CB, CURVE, RATES, GOVT, RISK ------------------------------------------- */
  function renderCB() {
    const host = panel('cb'), banks = S.schedule?.banks || [];
    if (!banks.length) return empty(host, 'Loading central banks…');
    const head = el('div', 'fx-th fx-c4'); head.append(el('span', '', 'BANK'), el('span', '', 'RATE'), el('span', '', 'NEXT'), el('span', '', 'IN')); host.append(head);
    for (const b of banks) {
      const rate = M.policyRate(b.currency, S.desk), next = M.nextDecision(b), r = rowButton('fx-c4', () => openPage('cb', b.short), `${b.name} details`);
      const stale = rate && M.lastDecisionBefore(b) > rate.observationDate;
      r.append(el('b', '', b.short.toUpperCase()), el('span', 'fx-num' + (stale ? ' fx-warn' : ''), rate ? rate.display + (stale ? '*' : '') : '—'), el('span', '', next ? day(next.date) : '—'), el('span', 'fx-num fx-up', next ? (next.at ? M.countdown(next.at - Date.now()) : next.daysAway + 'd') : ''));
      host.append(r);
    }
    const odds = S.desk?.fed?.odds;
    if (odds) {
      const box = btn('', 'fx-odds', () => openPage('cb', banks.find(b => b.area === 'US')?.short), 'Fed futures odds');
      const bar = el('span', 'fx-oddsbar'); for (const [k, c] of [['cut50', 'c2'], ['cut', 'c1'], ['hold', 'h'], ['hike', 'k1'], ['hike50', 'k2']]) if (odds[k] > 0) { const s = el('i', c); s.style.width = odds[k] + '%'; bar.append(s); }
      box.append(el('span', 'fx-sub', `FED ${day(odds.meeting)} · futures imply ${signed(odds.expectedChangeBp, 0, ' bp')}`), bar, el('span', 'fx-sub', [['cut50', 'Cut 50'], ['cut', 'Cut 25'], ['hold', 'Hold'], ['hike', 'Hike 25'], ['hike50', 'Hike 50']].filter(([k]) => odds[k] > 0).map(([k, l]) => `${l} ${Math.round(odds[k])}%`).join(' · ')));
      host.append(box);
    }
    host.append(el('p', 'fx-foot', '* A decision happened after this reading. Click a bank for its full page.'));
  }
  function setCurve(area) { S.curve = area; R('curve'); $('tp-curve')?.scrollIntoView?.({block: 'nearest'}); if (!$('tp-curve')) openPage('macro'); }
  function curveChart(area, {W = 320, H = 120} = {}) {
    const curve = S.desk?.curves?.[area], v = M.curveView(curve); if (!v) return null;
    const L = 30, R = 6, T = 8, B = 16, rows = v.rows, vals = rows.flatMap(r => [r.value, r.month]).filter(finite);
    const lo = Math.min(...vals) - 0.05, hi = Math.max(...vals) + 0.05, x = i => L + i * (W - L - R) / Math.max(1, rows.length - 1), y = val => T + (hi - val) / (hi - lo) * (H - T - B);
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fx-curve', role: 'img', 'aria-label': `${M.AREAS[area].label} yield curve ${v.latestDate}`});
    for (let k = 0; k <= 2; k++) { const val = lo + (hi - lo) * k / 2; c.append(svg('line', {x1: L, x2: W - R, y1: y(val), y2: y(val), class: 'g'})); const t = svg('text', {x: 2, y: y(val) + 3, class: 'a'}); t.textContent = val.toFixed(2); c.append(t); }
    const line = (key, cls) => { const p = rows.map((r, i) => finite(r[key]) ? `${x(i)},${y(r[key])}` : null).filter(Boolean); if (p.length > 1) c.append(svg('polyline', {points: p.join(' '), class: cls, fill: 'none'})); };
    line('month', 'ln-m'); line('value', 'ln-up');
    rows.forEach((r, i) => { const t = svg('text', {x: x(i), y: H - 3, class: 'a', 'text-anchor': 'middle'}); t.textContent = r.tenor; c.append(t); });
    return {chart: c, view: v, curve};
  }
  function tenorGrid(area, v, curve) {
    const grid = el('div', 'fx-tenors');
    for (const r of v.rows) { const b = btn('', 'fx-tenor', () => inspect(`${M.AREAS[area].short} ${r.tenor}`, h => kv(h, [['Yield', r.value.toFixed(3) + '%'], ['1 week change', signed(r.weekChangeBp, 0, ' bp')], ['1 month change', signed(r.monthChangeBp, 0, ' bp')], ['Close', v.latestDate], ['Source', link(curve.source, curve.sourceURL)]])), `${r.tenor} yield`); b.append(el('span', '', r.tenor), el('b', '', r.value.toFixed(2)), el('em', tone(r.monthChangeBp), signed(r.monthChangeBp, 0))); grid.append(b); }
    return grid;
  }
  function renderCurve() {
    tabs('curve-tabs', [['US', 'US'], ['EA', 'EA'], ['GB', 'UK'], ['JP', 'JP']], S.curve, setCurve);
    const host = panel('curve'), c = curveChart(S.curve);
    setText('t-curve', M.AREAS[S.curve].short);
    if (!c) return empty(host, 'Loading yield curves…');
    host.append(c.chart, tenorGrid(S.curve, c.view, c.curve), el('p', 'fx-foot', `${c.view.spread ? `${c.view.spread.label} ${signed(c.view.spread.bp, 0, ' bp')} · ` : ''}close ${c.view.latestDate} · Δ = 1M bp · dashed = a month ago`));
    if (S.curve === 'US' && S.desk?.liveUS?.quotes) { const live = el('div', 'fx-chips'); S.desk.liveUS.quotes.forEach(q => live.append(el('span', 'fx-chip', `${q.tenor} ${q.price.toFixed(3)} `), el('span', 'fx-chip ' + tone(q.price - q.previousClose), signed((q.price - q.previousClose) * 100, 1, 'bp')))); host.append(live); }
  }
  function renderGov() {
    const host = panel('gov'), areas = ['US', 'EA', 'GB', 'JP'].map(a => ({a, v: M.curveView(S.desk?.curves?.[a])})).filter(x => x.v);
    if (!areas.length) return empty(host, 'Loading government yields…');
    const tenors = ['2Y', '5Y', '10Y', '30Y'], pick = (v, t) => v.rows.find(r => r.tenor === t);
    const table = el('table', 'fx-table'), head = el('tr'); head.append(el('th', '', 'AREA')); tenors.forEach(t => head.append(el('th', '', t))); head.append(el('th', '', '2s10s')); table.append(head);
    for (const {a, v} of areas) {
      const tr = el('tr'); tr.append(el('th', '', M.AREAS[a].short));
      tenors.forEach(t => { const r = pick(v, t), td = el('td', 'fx-num'); if (r) td.append(btn(r.value.toFixed(2), 'fx-cell', () => setCurve(a))); else td.textContent = '—'; tr.append(td); });
      const s = pick(v, '10Y') && pick(v, '2Y') ? (pick(v, '10Y').value - pick(v, '2Y').value) * 100 : null; tr.append(el('td', 'fx-num ' + tone(s), finite(s) ? signed(s, 0) : '—')); table.append(tr);
    }
    host.append(table);
    const us = areas.find(x => x.a === 'US')?.v, gaps = areas.filter(x => x.a !== 'US').map(({a, v}) => { const u = pick(us || {rows: []}, '10Y'), o = pick(v, '10Y'); return u && o ? `US–${a} 10Y ${signed((u.value - o.value) * 100, 0, ' bp')}` : null; }).filter(Boolean);
    if (gaps.length) host.append(el('p', 'fx-foot', gaps.join(' · ') + ' · latest official closes'));
  }
  function renderRates() {
    const host = panel('rates'), list = (S.desk?.rates?.rows || []).filter(r => finite(r.value)).map(r => ({ccy: r.area === 'XM' ? 'EA' : r.area, value: r.value, date: r.observationDate})).sort((a, b) => b.value - a.value);
    if (!list.length) return empty(host, 'Loading policy rates…');
    const max = Math.max(...list.map(r => r.value), 1);
    for (const r of list) { const row = el('div', 'fx-row fx-rate'); const bar = el('span', 'fx-hbar'), fill = el('i'); fill.style.width = Math.max(0, r.value) / max * 100 + '%'; bar.append(fill); row.append(el('b', '', r.ccy), bar, el('span', 'fx-num', r.value.toFixed(2) + '%'), el('small', 'fx-dim', r.date ? day(r.date) : '')); host.append(row); }
    host.append(el('p', 'fx-foot', `${S.desk.rates.source} · latest observation per bank`));
  }
  function renderTerm() {
    const d = D(), ids = d.vol || ['^VIX9D', '^VIX', '^VIX3M', '^VIX6M'], host = panel('term');
    const vix = ['^VIX9D', '^VIX', '^VIX3M', '^VIX6M'].map(id => ({id, q: quoteFor(id)})).filter(x => x.q);
    if (!vix.length && !ids.some(id => quoteFor(id))) return empty(host, 'Loading volatility indices…');
    if (vix.length > 2) {
      const W = 300, H = 70, vals = vix.map(x => x.q.price), lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.05, x = i => 8 + i * (W - 16) / (vix.length - 1), y = v => 6 + (hi - v) / (hi - lo) * (H - 22);
      const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart', role: 'img', 'aria-label': 'VIX term structure ' + vix.map(v => `${shortOf(v.id)} ${v.q.price}`).join(', ')});
      c.append(svg('polyline', {points: vix.map((v, i) => `${x(i)},${y(v.q.price)}`).join(' '), class: 'ln-w', fill: 'none'}));
      vix.forEach((v, i) => { c.append(svg('circle', {cx: x(i), cy: y(v.q.price), r: 3, class: 'cd'})); const t = svg('text', {x: x(i), y: H - 3, class: 'a', 'text-anchor': i === 0 ? 'start' : i === vix.length - 1 ? 'end' : 'middle'}); t.textContent = (shortOf(v.id).replace('VIX', '') || '30D') + ' ' + v.q.price.toFixed(1); c.append(t); });
      host.append(c);
      const contango = vix.at(-1).q.price > vix[0].q.price;
      host.append(el('p', 'fx-sub', contango ? 'Upward slope (contango): markets expect calmer near term than later — the usual state.' : 'Inverted (backwardation): near-term fear above longer-term — a stress signal.'));
    }
    const rest = [...new Set([...ids, '^VVIX', '^MOVE', '^OVX', '^GVZ', '^VXN'])].filter(id => !['^VIX9D', '^VIX3M', '^VIX6M'].includes(id) && quoteFor(id)).slice(0, 6);
    rest.forEach(id => host.append(quoteRow(id)));
  }
  function renderRisk() {
    const host = panel('vix');
    if (S.vix?.rows?.length) {
      const rows = S.vix.rows.slice(-90), vals = rows.map(r => r.close), last = vals.at(-1), prev = vals.at(-2);
      const top = btn('', 'fx-vixhead', () => openPage('vol'), 'Volatility page');
      top.append(el('b', '', 'VIX ' + last.toFixed(2)), el('em', tone(last - prev), signed(last - prev, 2)), el('small', '', rows.at(-1).date)); host.append(top);
      const W = 300, H = 50, lo = Math.min(...vals), hi = Math.max(...vals), c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fx-spark', role: 'img', 'aria-label': `VIX last 90 closes, latest ${last.toFixed(2)}`});
      c.append(svg('polyline', {points: vals.map((v, i) => `${i * W / (vals.length - 1)},${H - 3 - (v - lo) / (hi - lo || 1) * (H - 6)}`).join(' '), class: 'ln-w', fill: 'none'})); host.append(c);
    } else host.append(el('p', 'fx-sub', 'VIX loading…'));
    const ten = S.desk?.liveUS?.quotes?.find(q => q.tenor === '10Y'), us = M.curveView(S.desk?.curves?.US);
    if (ten && S.deskKey !== 'all') { const r = rowButton('fx-c3', () => setCurve('US'), 'US 10-year'); r.append(el('b', '', 'US 10Y'), el('span', 'fx-num', ten.price.toFixed(3) + '%'), el('span', 'fx-num ' + tone(ten.price - ten.previousClose), signed((ten.price - ten.previousClose) * 100, 1, 'bp'))); host.append(r); if (us?.spread) { const s = el('div', 'fx-row fx-c3'); s.append(el('b', '', us.spread.label), el('span'), el('span', 'fx-num ' + tone(us.spread.bp), signed(us.spread.bp, 0, ' bp'))); host.append(s); } }
    const mood = S.edge?.mood, fxv = S.edge?.volatility;
    if (mood?.value) {
      const m = btn('', 'fx-mood', () => openPage('vol'), 'Market mood details');
      m.append(el('span', '', 'MOOD'), el('b', '', mood.value), el('span', '', 'FX VOL'), el('b', '', fxv ? `${M.ordinal(Math.round(fxv.percentile))} · ${fxv.value}` : '—'));
      host.append(m);
      const parts = el('div', 'fx-chips'); (mood.parts || []).slice(0, 6).forEach(i => parts.append(el('span', 'fx-chip ' + tone(i.value), `${i.name} ${finite(i.value) ? signed(i.value, 2) : ''}`))); host.append(parts);
    }
    if (S.deskKey === 'all') {
      const head = el('div', 'fx-th fx-c4'); head.append(el('span', '', 'BOOK'), el('span', '', 'BID'), el('span', '', 'ASK'), el('span', '', 'SPRD')); host.append(head);
      for (const p of ['BTC-USD', 'ETH-USD']) bookRow(host, p);
      host.append(el('p', 'fx-foot', 'Coinbase Exchange level-1 book · refreshes every 15 s'));
    }
  }
  function bookRow(host, p) {
    const b = S.books[p], r = rowButton('fx-c4', () => focusOn(p), `${p} top of book`);
    r.append(el('b', '', shortOf(p)), el('span', 'fx-num fx-up', b ? fmt(b.bid, digitsOf(p)) : '—'), el('span', 'fx-num fx-down', b ? fmt(b.ask, digitsOf(p)) : '—'), el('span', 'fx-num', b && finite(b.spreadBps) ? b.spreadBps.toFixed(2) + 'bp' : '—')); host.append(r);
  }
  function renderBooks() {
    const host = panel('books'), list = ['BTC-USD', 'ETH-USD'];
    const head = el('div', 'fx-th fx-c4'); head.append(el('span', '', 'BOOK'), el('span', '', 'BID'), el('span', '', 'ASK'), el('span', '', 'SPRD')); host.append(head);
    list.forEach(p => bookRow(host, p));
    const b = S.books['BTC-USD'];
    if (b) kv(host, [['BTC bid size', finite(b.bidSize) ? b.bidSize.toFixed(4) + ' BTC' : null], ['BTC ask size', finite(b.askSize) ? b.askSize.toFixed(4) + ' BTC' : null], ['Book time', b.time ? hhmm(b.time) : b.fetchedAt ? hhmm(b.fetchedAt) : null]]);
    host.append(el('p', 'fx-foot', 'Coinbase Exchange level-1 bid/ask · refreshes every 15 s'));
  }

  /* --- BIAS, EDGE, COT, RANGE ------------------------------------------------- */
  function biasRows() { return M.PAIRS.map(p => ({p, b: M.smartBias(p, {desk: S.desk, edgeMarket: S.edge?.markets?.find(m => m.symbol === p.id), livePrice: quoteFor(p.id)?.price})})).sort((a, c) => (c.b.score ?? -999) - (a.b.score ?? -999)); }
  function renderBias() {
    const host = panel('bias');
    for (const {p, b} of biasRows()) {
      const r = rowButton('fx-bias', () => { focusOn(p.id, {quiet: true}); openPage('bias', p.id); }, `${p.base}/${p.quote} bias`);
      const bar = el('span', 'fx-bbar'), fill = el('i', (b.score ?? 0) >= 0 ? 'up' : 'dn'), w = Math.abs(b.score ?? 0) / 2; fill.style.width = w + '%'; fill.style.left = ((b.score ?? 0) >= 0 ? 50 : 50 - w) + '%'; bar.append(el('b'), fill);
      r.append(el('b', '', `${p.base}${p.quote}`), el('span', 'fx-num fx-dim', quoteFor(p.id) ? fmt(quoteFor(p.id).price, EDGE[p.id][2]) : ''), bar, el('span', 'fx-num ' + ((b.score ?? 0) >= 15 ? 'fx-up' : (b.score ?? 0) <= -15 ? 'fx-down' : 'fx-flat'), finite(b.score) ? `${b.score > 0 ? '+' : ''}${b.score}` : 'n/a'));
      host.append(r);
    }
  }
  const edgeMarkets = () => (S.edge?.markets || []).filter(m => !D().edge || D().edge.includes(m.symbol));
  function trendPos(st) { return finite(st.close?.value) && finite(st.high20?.value) && finite(st.low20?.value) && st.high20.value > st.low20.value ? (st.close.value - st.low20.value) / (st.high20.value - st.low20.value) * 2 - 1 : null; }
  function renderEdge() {
    const host = panel('edge'), ms = edgeMarkets();
    if (!ms.length) return empty(host, S.edge ? 'No Edge Radar markets for this desk.' : 'Loading Edge Radar…');
    const head = el('div', 'fx-th fx-c5'); head.append(el('span', '', 'MKT'), el('span', '', 'REGIME'), el('span', '', 'TREND'), el('span', '', 'VOL'), el('span', '', 'EVENT')); host.append(head);
    for (const m of ms) {
      const st = m.state || {}, pos = trendPos(st);
      const r = rowButton('fx-c5', () => openPage('edge', m.symbol), `${m.symbol} ${st.regime?.value || ''}`);
      r.append(el('b', '', m.symbol), el('span', '', st.regime?.value || '—'), el('span', 'fx-num ' + tone(pos), pos === null ? '—' : signed(pos, 2)), el('span', 'fx-num', finite(st.volatilityPercentile?.value) ? M.ordinal(Math.round(st.volatilityPercentile.value)) : '—'), el('span', m.events?.eventIn24h ? 'fx-warn' : 'fx-dim', m.events?.eventIn24h ? '24h' : 'clear'));
      host.append(r);
    }
    host.append(el('p', 'fx-foot', `Snapshot ${ago(S.edge.generatedAt)} · trend = position in 20-day range · click for the market page`));
  }
  function renderPos() {
    const host = panel('pos'), ms = edgeMarkets().filter(m => finite(m.positioning?.net?.value)).sort((a, b) => b.positioning.net.value - a.positioning.net.value);
    if (!ms.length) return empty(host, S.edge ? 'No CFTC positioning for this desk.' : 'Loading positioning…');
    setText('n-pos', 'CFTC ' + (ms[0].positioning.reportDate || ''));
    for (const m of ms) {
      const n = m.positioning.net.value, r = rowButton('fx-posrow', () => openPage('edge', m.symbol), `${m.symbol} net ${Math.round(n * 100)}%`);
      const bar = el('span', 'fx-bbar'), fill = el('i', n >= 0 ? 'up' : 'dn'), w = Math.min(50, Math.abs(n) * 50); fill.style.width = w + '%'; fill.style.left = (n >= 0 ? 50 : 50 - w) + '%'; bar.append(el('b'), fill);
      r.append(el('b', '', m.symbol), bar, el('span', 'fx-num ' + tone(n), signed(n * 100, 0, '%') + (m.positioning.crowded?.value ? '!' : ''))); host.append(r);
    }
    host.append(el('p', 'fx-foot', '! = crowded vs its own history · speculators, net (long − short) / total'));
  }
  async function renderRange() {
    const id = D().range || 'EURUSD', host = panel('range');
    setText('t-range', `${EDGE[id]?.[0] || id} daily range · 1 year`);
    if (!S.bars[id]) { empty(host, 'Loading daily candles…'); await loadSeries(id); if (!$('b-range')) return; host.replaceChildren(); }
    const v = M.volDistribution(S.bars[id]?.raw, {symbol: id, pip: EDGE[id]?.[1]});
    if (!v) return empty(host, 'Not enough history for a range distribution.');
    const W = 300, H = 74, maxC = Math.max(...v.bins.map(b => b.count)), bw = W / v.bins.length;
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart', role: 'img', 'aria-label': `Daily range distribution; latest ${Math.round(v.latest)} ${v.unit.label}, ${v.percentile}th percentile`});
    v.bins.forEach((b, i) => c.append(svg('rect', {x: i * bw + 1, width: bw - 2, y: H - 14 - b.count / maxC * (H - 18), height: b.count / maxC * (H - 18), class: i === v.latestBin ? 'bar-on' : 'bar'})));
    [[0, v.bins[0].from], [v.bins.length - 1, v.bins.at(-1).to]].forEach(([i, val], k) => { const t = svg('text', {x: k ? W : 0, y: H - 2, class: 'a', 'text-anchor': k ? 'end' : 'start'}); t.textContent = fmt(val, v.unit.digits); c.append(t); });
    host.append(c, el('p', 'fx-sub', `Latest day ${fmt(v.latest, v.unit.digits)} ${v.unit.label} · ${M.ordinal(v.percentile)} percentile · busier than ${v.percentile}% of days`), el('p', 'fx-foot', `Median ${fmt(v.median, v.unit.digits)} · typical ${fmt(v.p25, v.unit.digits)}–${fmt(v.p75, v.unit.digits)} ${v.unit.label} · ${v.sample} days of ${S.bars[id].source} candles`));
  }

  /* --- ECO, EARNINGS, CORR, SESSIONS ---------------------------------------- */
  function ecoEvents() { const ccy = D().ccy; return (S.calendar?.events || []).filter(e => (!S.ecoHigh || e.impact === 'high') && (!ccy || ccy.includes(e.currency))).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)); }
  function ecoRow(e) {
    const past = Date.parse(e.time) < Date.now();
    const r = rowButton('fx-eco' + (past ? ' past' : ''), () => inspect(e.title, h => { kv(h, [['Currency', e.currency], ['Time', new Date(e.time).toLocaleString()], ['Impact', e.impact], ['Forecast', e.forecast || '—'], ['Previous', e.previous || '—'], ['Status', past ? 'Scheduled time has passed — check the source for the actual figure' : 'Upcoming'], ['Source', link('Forex Factory ↗︎', 'https://www.forexfactory.com/calendar')]]); h.append(btn('Full calendar ▸', 'fx-chip fx-chip-link', () => openPage('cal'))); }), e.title);
    r.append(el('time', '', new Date(e.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'})), el('b', 'cc-' + e.currency, e.currency), el('i', 'imp-' + e.impact, ''), el('span', 'fx-ht', e.title), el('span', 'fx-num', e.forecast || ''), el('span', 'fx-num fx-dim', e.previous || ''));
    return r;
  }
  function renderEco() {
    const ccy = D().ccy;
    setText('t-eco', ccy ? `${ccy.join('/')} calendar` : 'Economic calendar');
    tabs('eco-tabs', [[false, 'All'], [true, 'High']], S.ecoHigh, v => { S.ecoHigh = v; renderEco(); });
    const host = panel('eco'), ev = ecoEvents();
    if (!ev.length) return empty(host, S.calendar ? 'No events match.' : 'Loading calendar…');
    const now = Date.now(); let marked = false;
    for (const e of ev) { if (Date.parse(e.time) >= now && !marked) { host.append(el('div', 'fx-nowline', 'NOW')); marked = true; } host.append(ecoRow(e)); }
    // Scroll only inside the calendar panel; scrollIntoView also moved the whole page on phones.
    const nowLine = host.querySelector('.fx-nowline'); if (nowLine) host.scrollTop += nowLine.getBoundingClientRect().top - host.getBoundingClientRect().top;
  }
  function renderEarn() {
    const host = panel('earn'), today = new Date().toISOString().slice(0, 10), ev = (S.earn?.events || []).filter(e => e.date >= today);
    if (!ev.length) return empty(host, S.earn ? 'No large-company earnings in the published window.' : 'Loading earnings calendar…');
    let last = '';
    for (const e of ev.slice(0, 40)) {
      if (e.date !== last) { host.append(el('div', 'fx-th1', new Date(e.date + 'T12:00:00Z').toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'}))); last = e.date; }
      const r = rowButton('fx-earn', () => inspect(`${e.symbol} earnings`, h => { kv(h, [['Company', e.name], ['Date', e.date], ['Time', e.time], ['Fiscal quarter', e.fiscalQuarter], ['EPS forecast', finite(e.epsForecast) ? '$' + e.epsForecast.toFixed(2) : '—'], ['Estimates', e.estimates ?? '—'], ['Year-ago EPS', finite(e.lastYearEPS) ? '$' + e.lastYearEPS.toFixed(2) : '—'], ['Market value', big(e.marketCap)], ['Source', link('Nasdaq earnings calendar ↗︎', 'https://www.nasdaq.com/market-activity/earnings')]]); h.append(btn('Company page ▸', 'fx-chip fx-chip-link', () => openPage('des', e.symbol))); }), `${e.symbol} earnings ${e.date}`);
      r.append(el('b', '', e.symbol), el('span', 'fx-ht', e.name), el('small', 'fx-dim', e.time === 'After close' ? 'AMC' : e.time === 'Before open' ? 'BMO' : '—'), el('span', 'fx-num', finite(e.epsForecast) ? '$' + e.epsForecast.toFixed(2) : '—'));
      host.append(r);
    }
    host.append(el('p', 'fx-foot', `${S.earn.source} · EPS = consensus forecast · AMC after close, BMO before open`));
  }
  async function renderCorr(load = false) {
    tabs('corr-tabs', [[30, '30D'], [60, '60D'], [90, '90D']], S.corrWindow, v => { S.corrWindow = v; renderCorr(true); });
    const host = panel('corr');
    if (load && !S.corr[S.corrWindow]) { empty(host, 'Loading…'); await loadCorr(); host.replaceChildren(); }
    const c = S.corr[S.corrWindow]; if (!c?.matrix) return empty(host, 'Correlation data is loading or unavailable.');
    const names = c.pairs.map(p => (typeof p === 'string' ? p : p.label || p.id || '').replace('/', ''));
    const grid = el('div', 'fx-corr'); grid.style.gridTemplateColumns = `48px repeat(${names.length}, minmax(0,1fr))`;
    grid.append(el('span')); names.forEach(n => grid.append(el('span', 'fx-ch', n.slice(0, 6))));
    c.matrix.forEach((row, i) => {
      grid.append(el('span', 'fx-ch', names[i].slice(0, 6)));
      row.forEach((v, j) => { const b = btn(i === j ? '' : v.toFixed(2), 'fx-cc', () => inspect(`${names[i]} vs ${names[j]}`, h => kv(h, [['Correlation', v.toFixed(3)], ['Window', `${c.window} daily returns`], ['Period', `${c.startDate} → ${c.observationDate}`], ['Meaning', v > 0.6 ? 'Strongly move together' : v < -0.6 ? 'Strongly move opposite' : 'Weak relationship'], ['Method', c.method], ['Source', c.source]])), `${names[i]} vs ${names[j]} ${v.toFixed(2)}`);
        b.style.background = i === j ? 'transparent' : v >= 0 ? `rgba(91,141,239,${Math.abs(v) * 0.85})` : `rgba(244,162,97,${Math.abs(v) * 0.85})`; grid.append(b); });
    });
    host.append(grid, el('p', 'fx-foot', `${c.source} · to ${c.observationDate}`));
  }
  function sessionRows(host) {
    if (D().sessions === 'exchanges') {
      for (const [code, name, tz, open, close, idx] of EXCHANGES) { const st = zoneState(tz, open, close), q = quoteFor(idx), r = rowButton('fx-sess', () => focusOn(idx), `${name} ${st.open ? 'open' : 'closed'}`); r.append(el('b', '', code), el('span', 'fx-dim', st.time), el('span', st.open ? 'fx-up' : 'fx-dim', st.open ? 'OPEN' : 'CLOSED'), el('span', 'fx-num ' + tone(q?.changePercent), q ? `${shortOf(idx)} ${signed(q.changePercent, 2, '%')}` : '')); host.append(r); }
      return host.append(el('p', 'fx-foot', 'Regular cash-session hours in exchange local time; lunch breaks and holidays not shown.'));
    }
    for (const s of SESSIONS) { const st = sessionState(s), r = el('div', 'fx-row fx-c3'); r.append(el('b', '', st.name), el('span', 'fx-num', st.time + ' local'), el('span', st.open ? 'fx-up' : 'fx-dim', st.open ? 'OPEN' : 'CLOSED')); host.append(r); }
    host.append(el('p', 'fx-foot', 'Regular weekday FX session hours in local time. Holidays vary.'));
  }
  function renderSess() { setText('t-sess', D().sessions === 'exchanges' ? 'World exchanges' : 'Trading sessions'); sessionRows(panel('sess')); }

  /* --- OPTIONS -------------------------------------------------------------- */
  const OPT = () => S.opts?.underlyings || {};
  function renderOptList() {
    const host = panel('optlist'), list = Object.values(OPT());
    if (!list.length) return empty(host, 'Loading option chains…');
    const head = el('div', 'fx-th fx-omon'); head.append(el('span', '', 'UND'), el('span', '', 'LAST'), el('span', '', 'IV30'), el('span', '', 'P/C'), el('span', '', 'MOVE')); host.append(head);
    for (const u of list) {
      const e = u.expiries.find(x => x.dte >= 1) || u.expiries[0];
      const r = rowButton('fx-omon' + (S.optSym === u.symbol ? ' sel' : ''), () => { S.optSym = u.symbol; S.optExp = 0; R('optlist', 'opt', 'chain', 'active'); if (!$('tp-chain') && !$('tp-opt')) openPage('options', u.symbol); }, `${u.symbol} options`);
      r.append(el('b', '', u.symbol), el('span', 'fx-num', fmt(u.price, 2)), el('span', 'fx-num ' + tone(u.iv30Change), finite(u.iv30) ? u.iv30.toFixed(1) : '—'), el('span', 'fx-num ' + (u.putCallVolume > 1 ? 'fx-down' : u.putCallVolume < 0.6 ? 'fx-up' : ''), finite(u.putCallVolume) ? u.putCallVolume.toFixed(2) : '—'), el('span', 'fx-num', e?.movePercent ? '±' + e.movePercent.toFixed(1) + '%' : '—'));
      host.append(r);
    }
    host.append(el('p', 'fx-foot', `${S.opts.source} · MOVE = at-the-money straddle for the next expiry · ${hhmm(S.opts.generatedAt)}`));
  }
  function optSummary(host, u, onPick) {
    const e = u.expiries[S.optExp] || u.expiries[0];
    const out = el('div', 'fx-calcout fx-c4out'); const card = (k, v, cls) => { const d = el('div'); d.append(el('span', '', k), el('b', cls || '', v)); out.append(d); };
    card('LAST', fmt(u.price, 2)); card('IV30', finite(u.iv30) ? u.iv30.toFixed(1) + '%' : '—', tone(u.iv30Change)); card('P/C VOL', finite(u.putCallVolume) ? u.putCallVolume.toFixed(2) : '—'); card('P/C OI', finite(u.putCallOI) ? u.putCallOI.toFixed(2) : '—');
    host.append(out);
    const head = el('div', 'fx-th fx-exp'); head.append(el('span', '', 'EXPIRY'), el('span', '', 'ATM IV'), el('span', '', 'MOVE'), el('span', '', 'PAIN'), el('span', '', 'SKEW')); host.append(head);
    u.expiries.slice(0, 8).forEach((x, i) => { const r = rowButton('fx-exp' + (i === S.optExp ? ' sel' : ''), () => { S.optExp = i; if (onPick) onPick(i); else R('opt', 'chain'); }, `Expiry ${x.date}`); r.append(el('b', '', `${day(x.date)} · ${x.dte}d`), el('span', 'fx-num', finite(x.atmIV) ? (x.atmIV * 100).toFixed(1) + '%' : '—'), el('span', 'fx-num', finite(x.movePercent) ? `±${x.movePercent.toFixed(2)}%` : '—'), el('span', 'fx-num', finite(x.maxPain) ? fmt(x.maxPain, 0) : '—'), el('span', 'fx-num ' + tone(x.skew25), finite(x.skew25) ? signed(x.skew25 * 100, 1) : '—')); host.append(r); });
    host.append(el('p', 'fx-foot', `${u.contracts?.toLocaleString?.() || ''} contracts · MOVE = straddle / price · PAIN = max-pain strike · SKEW = 25Δ put − call IV (vol pts) · ${u.status === 'stale' ? 'previous snapshot' : 'Cboe delayed'}`));
    return e;
  }
  function renderOpt() {
    const sym = OPT()[S.optSym] ? S.optSym : OPT()[D().opt] ? D().opt : Object.keys(OPT())[0];
    if (sym) S.optSym = sym;
    setText('t-opt', sym ? `${sym} options` : 'Options');
    const host = panel('opt'), u = OPT()[sym];
    if (!u) return empty(host, S.opts ? 'No option chain for this underlying.' : 'Loading option chains…');
    optSummary(host, u);
  }
  function chainTable(u, e, {compact = false} = {}) {
    const table = el('table', 'fx-table fx-chain'), head = el('tr'), keys = compact ? ['bid', 'ask', 'iv', 'volume'] : ['bid', 'ask', 'iv', 'volume', 'oi'], H = {bid: 'BID', ask: 'ASK', iv: 'IV', volume: 'VOL', oi: 'OI'};
    [...keys.map(k => ['c', H[k]]), ['k', 'STRIKE'], ...keys.map(k => ['p', H[k]])].forEach(([c, h]) => head.append(el('th', c, h))); table.append(head);
    for (const row of e.chain) {
      const tr = el('tr', row.strike === e.atmStrike ? 'atm' : '');
      const cells = (o, itm) => keys.map(k => el('td', 'fx-num' + (itm ? ' itm' : ''), !o ? '—' : k === 'iv' ? (finite(o.iv) && o.iv > 0 ? (o.iv * 100).toFixed(1) : '—') : k === 'volume' || k === 'oi' ? count(o[k]) : fmt(o[k], 2)));
      tr.append(...cells(row.call, row.strike < u.price), el('th', 'k', fmt(row.strike, row.strike % 1 ? 1 : 0)), ...cells(row.put, row.strike > u.price));
      tr.addEventListener('click', () => inspect(`${u.symbol} ${day(e.date)} ${row.strike}`, h => { for (const [t, o] of [['Call', row.call], ['Put', row.put]]) { if (!o) continue; h.append(el('h3', 'fx-h4', t)); const m = finite(o.bid) && finite(o.ask) ? (o.bid + o.ask) / 2 : o.last; kv(h, [['Bid / ask', `${fmt(o.bid, 2)} / ${fmt(o.ask, 2)}`], ['Last', fmt(o.last, 2)], ['Implied vol', finite(o.iv) ? (o.iv * 100).toFixed(1) + '%' : '—'], ['Delta', finite(o.delta) ? o.delta.toFixed(3) : '—'], ['Volume', count(o.volume)], ['Open interest', count(o.oi)], ['Break-even (mid)', finite(m) ? fmt(t === 'Call' ? row.strike + m : row.strike - m, 2) : '—'], ['Cost per contract (mid)', finite(m) ? '$' + (m * 100).toFixed(0) : '—']]); } h.append(btn('Payoff calculator ▸', 'fx-chip fx-chip-link', () => openPage('calc', {kind: 'options', sym: u.symbol, strike: row.strike, premium: row.call ? (row.call.bid + row.call.ask) / 2 : null}))); }));
      table.append(tr);
    }
    return table;
  }
  function renderChain() {
    const u = OPT()[S.optSym], host = panel('chain');
    if (!u) return empty(host, S.opts ? 'Choose an underlying.' : 'Loading option chains…');
    const exps = u.expiries.slice(0, 8);
    tabs('chain-tabs', exps.map((x, i) => [i, day(x.date)]), S.optExp, v => { S.optExp = v; R('opt', 'chain'); });
    const e = exps[S.optExp] || exps[0];
    setText('t-chain', `${u.symbol} ${fmt(u.price, 2)} · ${e.dte}d · ATM IV ${finite(e.atmIV) ? (e.atmIV * 100).toFixed(1) + '%' : '—'}`);
    host.append(chainTable(u, e, {compact: true}), el('p', 'fx-foot', `Calls left, puts right · shaded = in the money · ATM row outlined · ±10 strikes around ${fmt(e.atmStrike, 0)} · click a row for details`));
  }
  function renderActive() {
    const host = panel('active'), all = Object.values(OPT()).flatMap(u => u.mostActive.map(c => ({...c, u: u.symbol}))).sort((a, b) => b.volume - a.volume).slice(0, 25);
    if (!all.length) return empty(host, 'Loading option activity…');
    const head = el('div', 'fx-th fx-act'); head.append(el('span', '', 'CONTRACT'), el('span', '', 'LAST'), el('span', '', 'IV'), el('span', '', 'VOL'), el('span', '', 'OI')); host.append(head);
    for (const c of all) {
      const r = rowButton('fx-act', () => { S.optSym = c.u; S.optExp = Math.max(0, OPT()[c.u].expiries.findIndex(x => x.date === c.expiry)); R('optlist', 'opt', 'chain'); if (!$('tp-chain')) openPage('options', c.u); }, `${c.u} ${c.strike} ${c.type === 'C' ? 'call' : 'put'}`);
      r.append(el('b', c.type === 'C' ? 'fx-up' : 'fx-down', `${c.u} ${day(c.expiry)} ${fmt(c.strike, c.strike % 1 ? 1 : 0)}${c.type}`), el('span', 'fx-num', fmt(c.last, 2)), el('span', 'fx-num', finite(c.iv) ? (c.iv * 100).toFixed(0) + '%' : '—'), el('span', 'fx-num', count(c.volume)), el('span', 'fx-num fx-dim', count(c.oi)));
      host.append(r);
    }
    host.append(el('p', 'fx-foot', 'Highest-volume contracts across the monitored underlyings today · C = call, P = put'));
  }

  /* --- FYNX INTELLIGENCE ---------------------------------------------------- */
  function intelItems(key = S.deskKey) {
    const d = DESK_DEFS[key], items = [], now = Date.now(), seen = new Set();
    const add = (score, tag, title, why, act, id) => { if (id && seen.has(id)) return; if (id) seen.add(id); items.push({score: Math.round(Math.max(1, Math.min(99, score))), tag, title, why, act}); };
    const ids = [...new Set(d.mkts.flatMap(([, g]) => universe(g)))];
    // 1. Moves that are large for that market (today's change vs 20-day typical move).
    for (const id of ids) {
      const q = quoteFor(id); if (!q || !finite(q.changePercent)) continue;
      const z = finite(q.vol20) && q.vol20 > 0 ? Math.abs(q.changePercent) / q.vol20 : null;
      if (z === null ? Math.abs(q.changePercent) < 2.5 : z < 1.6) continue;
      add(35 + (z ?? Math.abs(q.changePercent)) * 12, 'MOVE', `${shortOf(id)} ${signed(q.changePercent, 2, '%')} · ${nameOf(id)}`, z ? `${z.toFixed(1)}× its typical daily move (20-day)` : 'Unusually large move today', () => focusOn(id), 'm' + id);
    }
    // 2. Headlines from this desk's feed, newest and highest-priority first; boosted when they mention a desk market.
    const news = (d.news === 'all' ? S.briefing : S.desks[d.news]?.items || S.briefing).slice(0, 40);
    const names = ids.map(id => [id, nameOf(id).toLowerCase(), shortOf(id).toLowerCase()]).filter(([, n]) => n.length > 2);
    news.map(h => {
      const age = (now - Date.parse(h.publishedAt)) / 3600000, t = h.title.toLowerCase(), hit = names.find(([, n, s]) => t.includes(n) || (s.length > 2 && new RegExp(`\\b${s.replace(/[^a-z0-9]/g, '')}\\b`).test(t)));
      return {h, s: 55 - age * 6 + Math.min(20, (h.priorityScore || 0) / 50) + (hit ? 15 : 0) + (h.kind === 'official-release' ? 8 : 0), hit};
    }).filter(x => x.s > 30).sort((a, b) => b.s - a.s).slice(0, 4).forEach(({h, s, hit}) => add(s, h.kind === 'official-release' ? 'OFFICIAL' : 'NEWS', h.title, `${h.source} · ${ago(h.publishedAt)}${hit ? ' · mentions ' + shortOf(hit[0]) : ''}`, () => openPage('article', h), 'n' + h.id));
    // 3. High-impact events in the next 48 hours for this desk's currencies.
    for (const e of (S.calendar?.events || [])) {
      const hrs = (Date.parse(e.time) - now) / 3600000;
      if (e.impact !== 'high' || hrs < 0 || hrs > 48 || (d.ccy && !d.ccy.includes(e.currency))) continue;
      add(78 - hrs * 0.9, 'EVENT', `${e.currency} ${e.title}`, `${hrs < 1 ? 'within the hour' : 'in ' + Math.round(hrs) + 'h'}${e.forecast ? ' · forecast ' + e.forecast : ''}${e.previous ? ' · previous ' + e.previous : ''}`, () => openPage('cal'), 'e' + e.title + e.time);
    }
    // 4. Central bank decisions within a week; Fed pricing.
    for (const b of S.schedule?.banks || []) {
      const n = M.nextDecision(b); if (!n || (d.ccy && !d.ccy.includes(b.currency)) || key === 'crypto') continue;
      const days = n.at ? (n.at - now) / 86400000 : n.daysAway; if (days > 7) continue;
      add(74 - days * 4, 'CB', `${b.name} decides ${day(n.date)}`, `${days < 1 ? 'today' : 'in ' + Math.round(days) + ' days'} · policy rate ${M.policyRate(b.currency, S.desk)?.display || '—'}`, () => openPage('cb', b.short), 'cb' + b.short);
    }
    const odds = S.desk?.fed?.odds;
    if (odds && Math.abs(odds.expectedChangeBp) >= 8 && !['crypto'].includes(key)) add(58 + Math.min(20, Math.abs(odds.expectedChangeBp) / 2), 'FED', `Futures price ${signed(odds.expectedChangeBp, 0, ' bp')} at the ${day(odds.meeting)} FOMC`, [['cut50', 'cut 50'], ['cut', 'cut 25'], ['hold', 'hold'], ['hike', 'hike 25'], ['hike50', 'hike 50']].filter(([k]) => odds[k] > 0).map(([k, l]) => `${l} ${Math.round(odds[k])}%`).join(' · '), () => openPage('cb', 'Fed'), 'fed');
    // 5. Rates: a big daily move in the US 10-year.
    const ten = S.desk?.liveUS?.quotes?.find(q => q.tenor === '10Y');
    if (ten && ['all', 'bonds', 'forex', 'stocks', 'economy', 'funds', 'futures'].includes(key)) { const bp = (ten.price - ten.previousClose) * 100; if (Math.abs(bp) >= 4) add(50 + Math.abs(bp) * 2, 'RATES', `US 10-year ${signed(bp, 0, ' bp')} to ${ten.price.toFixed(2)}%`, 'Large one-day move in the benchmark yield', () => setCurve('US'), 'ten'); }
    // 6. Crowded futures positioning and strong Smart Bias.
    for (const m of S.edge?.markets || []) {
      if (d.edge && !d.edge.includes(m.symbol) && key !== 'all') continue;
      if (m.positioning?.crowded?.value) add(48 + Math.abs(m.positioning.net.value) * 30, 'COT', `${m.symbol} positioning is crowded ${m.positioning.net.value >= 0 ? 'long' : 'short'}`, `Speculators net ${signed(m.positioning.net.value * 100, 0, '%')} · CFTC ${m.positioning.reportDate || ''}`, () => openPage('edge', m.symbol), 'c' + m.symbol);
    }
    if (['all', 'forex'].includes(key)) biasRows().filter(r => finite(r.b.score) && Math.abs(r.b.score) >= 40).slice(0, 2).forEach(({p, b}) => add(44 + Math.abs(b.score) / 3, 'BIAS', `${p.base}/${p.quote} Smart Bias ${b.score > 0 ? '+' : ''}${b.score} (${b.label})`, b.components.map(c => `${c.label} ${c.score > 0 ? '+' : ''}${c.score}`).join(' · '), () => openPage('bias', p.id), 'b' + p.id));
    // 7. Volatility and options.
    const vix = quoteFor('^VIX');
    if (vix && finite(vix.changePercent) && Math.abs(vix.changePercent) >= 7 && key !== 'crypto') add(50 + Math.abs(vix.changePercent), 'VOL', `VIX ${signed(vix.changePercent, 1, '%')} to ${vix.price.toFixed(2)}`, vix.changePercent > 0 ? 'Fear gauge jumping' : 'Fear gauge easing', () => openPage('vol'), 'vix');
    if (['options', 'stocks', 'funds', 'all', 'indices', 'commodities', 'bonds'].includes(key)) for (const u of Object.values(OPT())) {
      if (key !== 'options' && key !== 'all' && !ids.includes(u.symbol) && u.symbol !== d.opt) continue;
      if (finite(u.putCallVolume) && u.callVolume + u.putVolume >= 25000 && (u.putCallVolume >= 1.3 || u.putCallVolume <= 0.45)) add(42 + Math.min(30, Math.abs(Math.log(u.putCallVolume)) * 20), 'OPT', `${u.symbol} put/call volume ${u.putCallVolume.toFixed(2)}`, u.putCallVolume > 1 ? 'Heavy put buying vs calls' : 'Heavy call buying vs puts', () => openPage('options', u.symbol), 'o' + u.symbol);
      if (finite(u.iv30Change) && Math.abs(u.iv30Change) >= 2) add(40 + Math.abs(u.iv30Change) * 3, 'IV', `${u.symbol} implied vol ${signed(u.iv30Change, 1)} pts to ${u.iv30?.toFixed(1)}%`, '30-day implied volatility change today', () => openPage('options', u.symbol), 'iv' + u.symbol);
    }
    // 8. Earnings for the biggest companies in the next two days.
    if (['stocks', 'options', 'all'].includes(key)) { const soon = new Date(now + 2 * 86400000).toISOString().slice(0, 10), today = new Date(now).toISOString().slice(0, 10); (S.earn?.events || []).filter(e => e.date >= today && e.date <= soon).slice(0, 3).forEach(e => add(46 + Math.min(20, Math.log10(e.marketCap / 1e9) * 8), 'EARN', `${e.symbol} reports ${day(e.date)} ${e.time === 'After close' ? 'after close' : e.time === 'Before open' ? 'before open' : ''}`, `${e.name} · EPS forecast ${finite(e.epsForecast) ? '$' + e.epsForecast.toFixed(2) : '—'} · ${big(e.marketCap)}`, () => openPage('des', e.symbol), 'er' + e.symbol)); }
    // Quiet tape: still show what is moving most and what is next, ranked lower.
    if (items.length < 5) {
      ids.filter(id => finite(quoteFor(id)?.changePercent)).map(id => ({id, q: quoteFor(id)})).sort((a, b) => Math.abs(b.q.changePercent) / (b.q.vol20 || 1) - Math.abs(a.q.changePercent) / (a.q.vol20 || 1)).slice(0, 3)
        .forEach(({id, q}) => add(20 + Math.abs(q.changePercent) / (q.vol20 || 1) * 10, 'MOVE', `${shortOf(id)} ${signed(q.changePercent, 2, '%')} · ${nameOf(id)}`, finite(q.vol20) ? `${(Math.abs(q.changePercent) / q.vol20).toFixed(1)}× its typical daily move · biggest on this desk` : 'Biggest move on this desk', () => focusOn(id), 'm' + id));
      (S.calendar?.events || []).filter(e => e.impact === 'high' && Date.parse(e.time) > now && (!d.ccy || d.ccy.includes(e.currency))).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).slice(0, 2)
        .forEach(e => add(18, 'EVENT', `${e.currency} ${e.title}`, `${new Date(e.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})}${e.forecast ? ' · forecast ' + e.forecast : ''}`, () => openPage('cal'), 'e' + e.title + e.time));
    }
    return items.sort((a, b) => b.score - a.score);
  }
  function intelRow(it, i) {
    const r = rowButton('fx-intel', it.act, it.title);
    const n = el('span', 'fx-rank', String(i + 1)), body = el('span', 'fx-ib'); body.append(el('b', '', it.title), el('small', '', it.why));
    const sc = el('span', 'fx-iscore'); sc.append(el('em', 'tag-' + it.tag.toLowerCase(), it.tag), el('i', '', String(it.score)));
    r.append(n, body, sc); return r;
  }
  function renderIntel() {
    const host = panel('intel'), items = S.sym ? symIntel() : intelItems();
    setText('t-intel', S.sym ? `FYNX Intelligence · ${shortOf(S.sym.symbol)}: what matters now` : `FYNX Intelligence · ${D().noun.toLowerCase()} ranked now`);
    if (!items.length) return empty(host, 'Scanning the live feeds…');
    items.slice(0, 8).forEach((it, i) => host.append(intelRow(it, i)));
    host.append(el('p', 'fx-foot', `Ranked from ${Object.values(S.feeds).filter(Boolean).length} live feeds: moves vs normal, headlines, events, central banks, rates, positioning and options. Not advice.`));
  }

  /* --- TOOLS: calculators, journal, sessions ----------------------------------- */
  const CALC_TITLE = {fx: 'Position size', shares: 'Share size', crypto: 'Crypto size', futures: 'Futures contracts', options: 'Option payoff', bond: 'Bond price', real: 'Real return'};
  function renderTools() {
    const kind = D().calc;
    tabs('tools-tabs', [['calc', 'CALC'], ['jrnl', 'JRNL'], ['sess', 'SESS']], S.tool, v => { S.tool = v; renderTools(); });
    const host = panel('tools');
    setText('t-tools', {calc: CALC_TITLE[kind], jrnl: 'Your journal', sess: 'Trading sessions'}[S.tool]);
    if (S.tool === 'calc') { calculator(host, kind, {compact: true}); return host.append(btn('All calculators ▸', 'fx-chip fx-chip-link', () => openPage('calc', {kind}))); }
    if (S.tool === 'jrnl') return renderJournal(host);
    sessionRows(host);
  }
  const calcState = {fx: {pair: 'EURUSD', balance: 10000, risk: 1, stop: 20}, shares: {balance: 10000, risk: 1, entry: null, stop: null, sym: null}, crypto: {balance: 10000, risk: 1, entry: null, stop: null, sym: 'BTC-USD'},
    futures: {sym: 'ES=F', balance: 50000, risk: 1, stop: 10}, options: {sym: 'SPY', type: 'C', strike: null, premium: null, qty: 1}, bond: {face: 1000, coupon: 4.5, ytm: 5, years: 10}, real: {nominal: 5, inflation: 3, years: 10, amount: 10000}};
  function calculator(host, kind, {compact = false, preset} = {}) {
    const st = calcState[kind]; if (preset) Object.assign(st, preset);
    const form = el('form', 'fx-form'); form.addEventListener('submit', e => e.preventDefault());
    const field = (label, input) => { const l = el('label'); l.append(el('span', '', label), input); form.append(l); return input; };
    const num = (v, step) => { const i = document.createElement('input'); i.type = 'number'; i.inputMode = 'decimal'; i.step = step; i.min = '0'; i.value = v ?? ''; return i; };
    const select = (opts, v) => { const s = document.createElement('select'); opts.forEach(([val, l]) => { const o = el('option', '', l); o.value = val; s.append(o); }); s.value = v; return s; };
    const out = el('div', 'fx-calcout');
    const card = (k, v, cls) => { const d = el('div'); d.append(el('span', '', k), el('b', cls || '', v)); out.append(d); };
    const note = t => out.append(el('p', 'fx-foot', t));
    let compute;
    if (kind === 'fx') {
      const pairs = M.PAIRS.map(p => p.id).concat(['XAUUSD']);
      const sel = field('Pair', select(pairs.map(p => [p, p]), st.pair)), bal = field('Balance $', num(st.balance, '100')), risk = field('Risk %', num(st.risk, '0.1')), stop = field('Stop (pips)', num(st.stop, '1'));
      compute = () => {
        Object.assign(st, {pair: sel.value, balance: Number(bal.value), risk: Number(risk.value), stop: Number(stop.value)});
        const id = st.pair, pip = EDGE[id][1], quoteCcy = id.slice(3), edgePx = s => S.edge?.markets?.find(m => m.symbol === s)?.state?.close?.value, price = quoteFor(id)?.price ?? edgePx(id);
        const contract = id === 'XAUUSD' ? 100 : 100000;
        let usdPerQuote = null;
        if (quoteCcy === 'USD') usdPerQuote = 1;
        else if (id.startsWith('USD') && finite(price)) usdPerQuote = 1 / price;
        else { const conv = quoteFor('USD' + quoteCcy)?.price ?? quoteFor(quoteCcy + '=X')?.price ?? edgePx('USD' + quoteCcy); const inv = quoteFor(quoteCcy + 'USD')?.price ?? edgePx(quoteCcy + 'USD'); usdPerQuote = finite(conv) ? 1 / conv : finite(inv) ? inv : null; }
        out.replaceChildren();
        if (![st.balance, st.risk, st.stop].every(v => finite(v) && v > 0) || !finite(usdPerQuote)) return note('Enter positive values. A current price is needed for this pair.');
        const pipValue = pip * contract * usdPerQuote, riskUsd = st.balance * st.risk / 100, lots = Math.floor(riskUsd / (st.stop * pipValue) * 100) / 100;
        card('RISK', '$' + riskUsd.toFixed(2)); card('LOTS', lots.toFixed(2)); card('UNITS', Math.round(lots * contract).toLocaleString()); card('PIP / LOT', '$' + pipValue.toFixed(2));
        if (!compact) { card('PIP / MINI', '$' + (pipValue / 10).toFixed(2)); card('NOTIONAL', finite(price) ? '$' + Math.round(lots * contract * price * (quoteCcy === 'USD' ? 1 : usdPerQuote)).toLocaleString() : '—'); }
        note(`Price ${finite(price) ? fmt(price, EDGE[id][2]) : '—'} · lots rounded down to 0.01 · confirm your broker's contract size.`);
      };
    } else if (kind === 'shares' || kind === 'crypto') {
      const def = kind === 'crypto' ? 'BTC-USD' : (info(S.focus).group === 'Stocks' || /funds/.test(info(S.focus).group) ? S.focus : 'AAPL');
      if (!st.sym || (preset?.sym)) st.sym = preset?.sym || def;
      const syms = kind === 'crypto' ? universe(['Crypto']) : universe(['Stocks', 'Equity funds', 'Sector funds']);
      const sel = field(kind === 'crypto' ? 'Coin' : 'Symbol', select((syms.length ? syms : [st.sym]).map(s => [s, shortOf(s)]), st.sym));
      const bal = field('Account $', num(st.balance, '100')), risk = field('Risk %', num(st.risk, '0.1'));
      const live = () => quoteFor(sel.value)?.price;
      const entry = field('Entry', num(st.entry ?? (finite(live()) ? +live().toFixed(digitsOf(sel.value)) : ''), 'any')), stop = field('Stop', num(st.stop ?? (finite(live()) ? +(live() * 0.97).toFixed(digitsOf(sel.value)) : ''), 'any'));
      sel.addEventListener('change', () => { const p = live(); if (finite(p)) { entry.value = +p.toFixed(digitsOf(sel.value)); stop.value = +(p * 0.97).toFixed(digitsOf(sel.value)); } });
      compute = () => {
        Object.assign(st, {sym: sel.value, balance: Number(bal.value), risk: Number(risk.value), entry: Number(entry.value), stop: Number(stop.value)});
        out.replaceChildren();
        const per = Math.abs(st.entry - st.stop);
        if (![st.balance, st.risk, st.entry, st.stop].every(v => finite(v) && v > 0) || !per) return note('Enter account, risk, an entry and a different stop price.');
        const riskUsd = st.balance * st.risk / 100, units = kind === 'crypto' ? Math.floor(riskUsd / per * 1e4) / 1e4 : Math.floor(riskUsd / per), pos = units * st.entry;
        card('RISK', '$' + riskUsd.toFixed(2)); card(kind === 'crypto' ? 'UNITS' : 'SHARES', kind === 'crypto' ? units.toFixed(4) : units.toLocaleString()); card('POSITION', '$' + pos.toLocaleString('en-US', {maximumFractionDigits: 2})); card('RISK / UNIT', '$' + per.toFixed(2));
        if (!compact) { card('% OF ACCOUNT', (pos / st.balance * 100).toFixed(1) + '%'); card('2R TARGET', fmt(st.entry + (st.entry > st.stop ? 2 : -2) * per, 2)); }
        note(`${st.entry > st.stop ? 'Long' : 'Short'} · live ${shortOf(st.sym)} ${finite(live()) ? fmt(live(), digitsOf(st.sym)) : '—'} · ${kind === 'crypto' ? 'units rounded down to 0.0001' : 'whole shares'} · fees not included.`);
      };
    } else if (kind === 'futures') {
      const sel = field('Contract', select(Object.entries(FUTSPEC).map(([s, v]) => [s, `${shortOf(s)} · ${v[0]}`]), st.sym)), bal = field('Account $', num(st.balance, '1000')), risk = field('Risk %', num(st.risk, '0.1')), stop = field('Stop (points)', num(st.stop, 'any'));
      compute = () => {
        Object.assign(st, {sym: sel.value, balance: Number(bal.value), risk: Number(risk.value), stop: Number(stop.value)});
        out.replaceChildren();
        const [, mult, tick] = FUTSPEC[st.sym], px = quoteFor(st.sym)?.price;
        if (![st.balance, st.risk, st.stop].every(v => finite(v) && v > 0)) return note('Enter positive values.');
        const riskUsd = st.balance * st.risk / 100, perC = st.stop * mult, n = Math.floor(riskUsd / perC);
        card('RISK', '$' + riskUsd.toFixed(2)); card('CONTRACTS', String(n)); card('$ / POINT', '$' + mult.toLocaleString()); card('RISK / CONTRACT', '$' + perC.toLocaleString('en-US', {maximumFractionDigits: 2}));
        if (!compact) { card('TICK VALUE', '$' + (tick * mult).toFixed(2)); card('NOTIONAL / CONTRACT', finite(px) ? '$' + Math.round(px * mult).toLocaleString() : '—'); }
        note(`${FUTSPEC[st.sym][0]} · last ${finite(px) ? fmt(px, digitsOf(st.sym)) : '—'} · tick ${tick} · CME contract size; margin varies by broker.`);
      };
    } else if (kind === 'options') {
      const syms = Object.keys(OPT()); if (!syms.includes(st.sym)) st.sym = syms[0] || 'SPY';
      const sel = field('Underlying', select((syms.length ? syms : [st.sym]).map(s => [s, s]), st.sym)), type = field('Type', select([['C', 'Call'], ['P', 'Put']], st.type));
      const u0 = OPT()[st.sym], atm = u0?.expiries?.[0]?.atmStrike;
      const strike = field('Strike', num(st.strike ?? atm ?? '', 'any')), prem = field('Premium (per share)', num(st.premium ?? '', 'any')), qty = field('Contracts', num(st.qty, '1'));
      compute = () => {
        Object.assign(st, {sym: sel.value, type: type.value, strike: Number(strike.value), premium: Number(prem.value), qty: Number(qty.value)});
        out.replaceChildren();
        const u = OPT()[st.sym], px = u?.price, move = (u?.expiries.find(x => x.dte >= 1) || u?.expiries?.[0])?.movePercent;
        if (![st.strike, st.premium, st.qty].every(v => finite(v) && v > 0)) return note('Enter strike, premium and contracts. Click a chain row to prefill.');
        const cost = st.premium * 100 * st.qty, be = st.type === 'C' ? st.strike + st.premium : st.strike - st.premium;
        const pay = s => ((st.type === 'C' ? Math.max(0, s - st.strike) : Math.max(0, st.strike - s)) - st.premium) * 100 * st.qty;
        card('COST / MAX LOSS', '$' + cost.toLocaleString('en-US', {maximumFractionDigits: 0})); card('BREAK-EVEN', fmt(be, 2)); card('TO BREAK-EVEN', finite(px) ? signed((be / px - 1) * 100, 2, '%') : '—'); card('MAX GAIN', st.type === 'C' ? 'Unlimited' : '$' + Math.round((st.strike - st.premium) * 100 * st.qty).toLocaleString());
        if (finite(px) && finite(move)) { card(`P/L AT +${move.toFixed(1)}%`, signed(pay(px * (1 + move / 100)), 0, ''), tone(pay(px * (1 + move / 100)))); card(`P/L AT −${move.toFixed(1)}%`, signed(pay(px * (1 - move / 100)), 0, ''), tone(pay(px * (1 - move / 100)))); }
        note(`At expiry, before fees · ${st.sym} ${finite(px) ? fmt(px, 2) : '—'} · ± = options-implied move for the next expiry.`);
      };
    } else if (kind === 'bond') {
      const face = field('Face value $', num(st.face, '100')), cpn = field('Coupon %', num(st.coupon, '0.125')), ytm = field('Yield %', num(st.ytm, '0.01')), yrs = field('Years to maturity', num(st.years, '0.5'));
      const ten = S.desk?.liveUS?.quotes?.find(q => q.tenor === '10Y'); if (ten && st.ytm === 5 && !preset) ytm.value = ten.price.toFixed(3);
      compute = () => {
        Object.assign(st, {face: Number(face.value), coupon: Number(cpn.value), ytm: Number(ytm.value), years: Number(yrs.value)});
        out.replaceChildren();
        if (![st.face, st.years].every(v => finite(v) && v > 0) || !finite(st.coupon) || !finite(st.ytm)) return note('Enter face value, coupon, yield and years.');
        const n = Math.round(st.years * 2), c = st.face * st.coupon / 200, y = st.ytm / 200;
        let price = 0, dur = 0; for (let t = 1; t <= n; t++) { const cf = c + (t === n ? st.face : 0), pv = cf / (1 + y) ** t; price += pv; dur += t / 2 * pv; }
        const mac = dur / price, mod = mac / (1 + y), dv01 = mod * price / 10000;
        card('PRICE', '$' + price.toFixed(2)); card('% OF PAR', (price / st.face * 100).toFixed(3)); card('MOD. DURATION', mod.toFixed(2) + ' yrs'); card('DV01', '$' + dv01.toFixed(3));
        if (!compact) { card('MAC. DURATION', mac.toFixed(2) + ' yrs'); card('+100 BP PRICE', '$' + (price - mod * price * 0.01).toFixed(2)); }
        note('Semi-annual coupons, priced on a coupon date. Yield prefilled from the live US 10-year.');
      };
    } else {
      const amt = field('Amount $', num(st.amount, '100')), nom = field('Nominal return %', num(st.nominal, '0.1')), inf = field('Inflation %', num(st.inflation, '0.1')), yrs = field('Years', num(st.years, '1'));
      compute = () => {
        Object.assign(st, {amount: Number(amt.value), nominal: Number(nom.value), inflation: Number(inf.value), years: Number(yrs.value)});
        out.replaceChildren();
        if (![st.amount, st.years].every(v => finite(v) && v > 0) || !finite(st.nominal) || !finite(st.inflation)) return note('Enter amount, returns and years.');
        const real = ((1 + st.nominal / 100) / (1 + st.inflation / 100) - 1) * 100, fv = st.amount * (1 + st.nominal / 100) ** st.years, rv = st.amount * (1 + real / 100) ** st.years;
        card('REAL RETURN', real.toFixed(2) + '%', tone(real)); card('NOMINAL VALUE', '$' + Math.round(fv).toLocaleString()); card("TODAY'S MONEY", '$' + Math.round(rv).toLocaleString()); card('LOST TO INFLATION', '$' + Math.round(fv - rv).toLocaleString());
        note('Fisher equation, compounded yearly. Use the latest CPI release on the calendar for inflation.');
      };
    }
    host.append(form, out);
    form.addEventListener('input', compute); form.addEventListener('change', compute); compute();
  }
  function renderJournal(host) {
    const j = S.journal;
    if (j.status === 'signed-out') { host.append(el('p', 'fx-sub', 'Sign in to see your saved trades here.')); host.append(link('Sign in ↗︎', '/auth/login.html?return=/terminal.html', 'fx-chip fx-chip-link'), btn('Journal page ▸', 'fx-chip fx-chip-link', () => openPage('journal'))); return; }
    if (j.status !== 'ready') return empty(host, j.status === 'error' ? 'Journal sync is unavailable right now.' : 'Loading your journal…');
    const t = j.trades, pls = t.map(x => x.pl).filter(finite), net = pls.reduce((s, v) => s + v, 0), wins = pls.filter(v => v > 0).length;
    const out = el('div', 'fx-calcout'); const card = (k, v, cls) => { const d = el('div'); d.append(el('span', '', k), el('b', cls || '', v)); out.append(d); };
    card('TRADES', String(t.length)); card('WIN RATE', pls.length ? (wins / pls.length * 100).toFixed(0) + '%' : '—'); card('NET P/L', pls.length ? (net >= 0 ? '+$' : '−$') + Math.abs(net).toFixed(2) : '—', tone(net)); card('BEST', pls.length ? '$' + Math.max(...pls).toFixed(2) : '—');
    host.append(out);
    const sorted = [...t].filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length > 1) { let run = 0; const eq = sorted.map(x => (run += x.pl || 0)), W = 300, H = 46, lo = Math.min(0, ...eq), hi = Math.max(0, ...eq); const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart fx-spark', role: 'img', 'aria-label': 'Your equity curve'}); c.append(svg('polyline', {points: eq.map((v, i) => `${i * W / (eq.length - 1)},${H - 3 - (v - lo) / (hi - lo || 1) * (H - 6)}`).join(' '), class: 'ln-w', fill: 'none'})); host.append(c); }
    sorted.slice(-5).reverse().forEach(x => { const r = el('div', 'fx-row fx-c3'); r.append(el('span', '', x.date), el('b', '', x.symbol || '—'), el('span', 'fx-num ' + tone(x.pl), finite(x.pl) ? signed(x.pl, 2) : '—')); host.append(r); });
    host.append(btn('Full journal ▸', 'fx-chip fx-chip-link', () => openPage('journal')));
  }
  window.addEventListener('fx-journal', e => { S.journal = e.detail; if (S.tool === 'jrnl') R('tools'); PG?.refresh?.('journal'); });

  /* --- any-symbol data (FYNX market proxy; falls back to the terminal's own feeds) ---------- */
  /* The proxy runs as a Vercel function. The site may be served from another host, so try this origin first,
   * then the Vercel production deployment (the function sends CORS headers for any origin). */
  const MARKET_FNS = ['/fn/market.js', 'https://fynxfinanceworld.vercel.app/fn/market.js'];
  let marketFn = null;
  async function fnMarket(params, timeout = 15000) {
    const qs = '?' + new URLSearchParams(params), order = marketFn ? [marketFn, ...MARKET_FNS.filter(u => u !== marketFn)] : MARKET_FNS;
    let last;
    for (const base of order) {
      try {
        const r = await fetch(base + qs, {signal: AbortSignal.timeout(timeout), credentials: 'omit', referrerPolicy: 'no-referrer', headers: {Accept: 'application/json'}});
        if (!/json/.test(r.headers.get('content-type') || '')) throw new Error('Proxy not on ' + base);
        const d = await r.json(); marketFn = base;
        if (!r.ok) throw Object.assign(new Error(d?.error || 'HTTP ' + r.status), {final: r.status === 400 || r.status === 404});
        return d;
      } catch (e) { last = e; if (e.final) throw e; }
    }
    throw last;
  }
  async function symHistory(symbol, range = '2y') {
    const key = symbol + '|' + range, hit = S.symData[key];
    if (hit && Date.now() - hit.at < 300000) return hit;
    try {
      const d = await fnMarket({op: 'chart', symbol, range});
      if (Array.isArray(d?.rows) && d.rows.length) {
        const v = {...d, at: Date.now()}; S.symData[key] = v; S.symData[symbol] = v;
        S.symQuotes[symbol] = {price: d.price, changePercent: d.changePercent, previousClose: d.previousClose, dayHigh: d.dayHigh, dayLow: d.dayLow, volume: d.volume, high52: d.high52, low52: d.low52, asOf: d.asOf, name: d.name, currency: d.currency, exchange: d.exchange, source: 'Yahoo Finance (delayed)', vol20: volOf(d.rows.map(r => r.close), 20)};
        return v;
      }
    } catch (e) { report('fn-chart', e); }
    const series = await loadSeries(FX_TO_EDGE[symbol] || symbol);
    if (!series?.rows?.length) return null;
    const v = {symbol, name: nameOf(symbol), rows: series.rows, source: series.source, at: Date.now(), fallback: true};
    S.symData[key] = v; if (!S.symData[symbol]) S.symData[symbol] = v;
    return v;
  }
  function volOf(closes, n) { const r = []; for (let i = Math.max(1, closes.length - n); i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]) * 100); if (r.length < 5) return null; const m = r.reduce((a, b) => a + b, 0) / r.length; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); }
  const benchFor = (symbol, cls) => cls === 'crypto' ? (symbol === 'BTC-USD' ? 'QQQ' : 'BTC-USD') : cls === 'fx' ? 'DX-Y.NYB' : symbol === 'SPY' ? 'QQQ' : 'SPY';
  /* Risk from daily closes: annualized volatility, beta and correlation vs a benchmark, max drawdown, historical 1-day VaR. */
  function riskStats(rows, benchRows, perYear = 252) {
    const last = rows.slice(-perYear - 1), rets = [];
    for (let i = 1; i < last.length; i++) rets.push({date: last[i].date.slice(0, 10), r: last[i].close / last[i - 1].close - 1});
    if (rets.length < 30) return null;
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length, sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
    const rs = rets.map(x => x.r), vol = sd(rs) * Math.sqrt(perYear) * 100;
    let peak = -Infinity, mdd = 0; for (const p of last) { peak = Math.max(peak, p.close); mdd = Math.min(mdd, p.close / peak - 1); }
    const sorted = [...rs].sort((a, b) => a - b), var95 = -sorted[Math.floor(sorted.length * 0.05)] * 100;
    const total = (last.at(-1).close / last[0].close - 1) * 100;
    let beta = null, corr = null;
    if (benchRows?.length) {
      const bm = new Map(); for (let i = 1; i < benchRows.length; i++) bm.set(benchRows[i].date.slice(0, 10), benchRows[i].close / benchRows[i - 1].close - 1);
      const pairs = rets.filter(x => bm.has(x.date)).map(x => [x.r, bm.get(x.date)]);
      if (pairs.length >= 30) { const a = pairs.map(p => p[0]), b = pairs.map(p => p[1]), ma = mean(a), mb = mean(b); let cov = 0, vb = 0, va = 0; pairs.forEach(([x, y]) => { cov += (x - ma) * (y - mb); vb += (y - mb) ** 2; va += (x - ma) ** 2; }); beta = cov / vb; corr = cov / Math.sqrt(va * vb); }
    }
    return {vol, mdd: mdd * 100, var95, total, beta, corr, ratio: vol ? total / vol : null, days: rets.length};
  }
  /* Normalized % comparison chart for several series. */
  const CMP_COLORS = ['#ffb000', '#5b8def', '#3ecf8e', '#c4a1ff', '#ff8a80', '#5ed3d3'];
  function compareChart(series, {W = 640, H = 220, sessions = 252, scale = 1} = {}) {
    // scale > 1 (phones) enlarges axis text, margins and lines so they stay readable once the SVG is shrunk to a ~300px column.
    const wrap = el('div', 'fx-chartwrap'), valid = series.filter(x => x.rows?.length > 2);
    if (!valid.length) { wrap.append(el('p', 'fx-empty', 'Loading comparison…')); return wrap; }
    const start = valid.map(x => x.rows.at(-Math.min(sessions, x.rows.length)).date.slice(0, 10)).sort().at(-1);
    const lines = valid.map((x, i) => { const rows = x.rows.filter(r => r.date.slice(0, 10) >= start), b = rows[0]?.close; return {label: x.label, color: x.color || CMP_COLORS[i % CMP_COLORS.length], pts: rows.map(r => ({date: r.date.slice(0, 10), v: (r.close / b - 1) * 100}))}; }).filter(l => l.pts.length > 1);
    const all = lines.flatMap(l => l.pts.map(p => p.v)), lo = Math.min(0, ...all), hi = Math.max(0, ...all), pad = (hi - lo) * 0.08 || 1;
    const dates = [...new Set(lines.flatMap(l => l.pts.map(p => p.date)))].sort(), xi = new Map(dates.map((d, i) => [d, i]));
    const L = 6, R = Math.round(52 * scale), T = 8 * scale, B = Math.round(20 * scale), fs = scale === 1 ? null : {style: `font-size:${10 * scale}px`}, x = i => L + i * (W - L - R) / Math.max(1, dates.length - 1), y = v => T + (hi + pad - v) / (hi - lo + 2 * pad) * (H - T - B);
    const c = svg('svg', {viewBox: `0 0 ${W} ${H}`, class: 'fx-chart', role: 'img', 'aria-label': 'Performance comparison: ' + lines.map(l => `${l.label} ${signed(l.pts.at(-1).v, 1, '%')}`).join(', ')});
    for (let k = 0; k <= 4; k++) { const v = lo - pad + (hi - lo + 2 * pad) * k / 4; c.append(svg('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g'})); const t = svg('text', {x: W - R + 6 * scale, y: y(v) + 4 * scale, class: 'a', ...fs}); t.textContent = signed(v, 1, '%'); c.append(t); }
    c.append(svg('line', {x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: '#56635c', 'stroke-dasharray': '3 3'}));
    for (const l of lines) c.append(svg('polyline', {points: l.pts.map(p => `${x(xi.get(p.date)).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '), fill: 'none', stroke: l.color, 'stroke-width': 1.7 * scale}));
    [0, dates.length - 1].forEach((i, k) => { const t = svg('text', {x: x(i), y: H - 5 * scale, class: 'a', 'text-anchor': k ? 'end' : 'start', ...fs}); t.textContent = day(dates[i]); c.append(t); });
    const legend = el('div', 'fx-legend'); lines.forEach(l => { const s = el('span'); const dot = el('i'); dot.style.background = l.color; s.append(dot, el('b', '', l.label), el('em', tone(l.pts.at(-1).v), signed(l.pts.at(-1).v, 2, '%'))); legend.append(s); });
    wrap.append(legend, c); return wrap;
  }

  /* --- symbol panels --------------------------------------------------------------------- */
  const perfOf = (rows, n) => rows.length > n ? (rows.at(-1).close / rows.at(-1 - n).close - 1) * 100 : null;
  function renderSQuote() {
    const host = panel('squote'), s = S.sym; if (!s) return empty(host, 'Pick a market with Find.');
    const q = quoteFor(s.symbol), d = S.symData[s.symbol], rows = d?.rows || S.history[s.symbol]?.rows || [], dg = digitsOf(s.symbol);
    setText('t-squote', `${shortOf(s.symbol)} · ${d?.exchange || s.exchange || ''} ${d?.currency ? '· ' + d.currency : ''}`);
    if (!q) return empty(host, 'Loading quote…');
    const top = el('div', 'fx-sqhead'); top.append(el('b', '', fmt(q.price, dg)), el('em', tone(q.changePercent), signed(q.changePercent, 2, '%')), el('small', '', q.asOf ? new Date(q.asOf).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : ''));
    host.append(el('p', 'fx-sub fx-sqname', s.name || nameOf(s.symbol)), top);
    const st = el('div', 'fx-calcout fx-c4out');
    const card = (k, v, cls) => { const x = el('div'); x.append(el('span', '', k), el('b', cls || '', v)); st.append(x); };
    card('PREV', fmt(q.previousClose, dg)); card('DAY LO–HI', finite(q.dayLow) ? `${fmt(q.dayLow, dg)}–${fmt(q.dayHigh, dg)}` : '—'); card('VOLUME', count(q.volume)); card('20D VOL', finite(q.vol20) ? q.vol20.toFixed(2) + '%' : '—');
    host.append(st);
    if (finite(q.high52) && finite(q.low52) && q.high52 > q.low52) { const r = el('div', 'fx-52'); const bar = el('span', 'pg-rbar'), dot = el('i'); dot.style.left = Math.max(0, Math.min(100, (q.price - q.low52) / (q.high52 - q.low52) * 100)) + '%'; bar.append(dot); r.append(el('small', '', '52W ' + fmt(q.low52, dg)), bar, el('small', '', fmt(q.high52, dg))); host.append(r); }
    if (rows.length > 30) { const p = el('div', 'fx-perfrow'); for (const [n, l] of [[5, '1W'], [21, '1M'], [63, '3M'], [126, '6M'], [251, '1Y']]) { const v = perfOf(rows, n); const x = el('span'); x.append(el('small', '', l), el('b', tone(v), finite(v) ? signed(v, 1, '%') : '—')); p.append(x); } host.append(p); }
    host.append(el('p', 'fx-foot', `${q.source || 'Delayed quote'} · prices adjusted for splits and dividends`));
  }
  async function renderSRisk() {
    const host = panel('srisk'), s = S.sym; if (!s) return;
    const bench = benchFor(s.symbol, s.cls); setText('t-srisk', `Risk vs ${shortOf(bench)} · 1 year`);
    const d = S.symData[s.symbol]; if (!d) return empty(host, 'Loading history…');
    const b = await symHistory(bench); if (!$('b-srisk') || S.sym?.symbol !== s.symbol) return;
    const r = riskStats(d.rows, b?.rows, s.cls === 'crypto' ? 365 : 252); host.replaceChildren();
    if (!r) return empty(host, 'Not enough daily history for risk numbers.');
    const out = el('div', 'fx-calcout'); const card = (k, v, cls) => { const x = el('div'); x.append(el('span', '', k), el('b', cls || '', v)); out.append(x); };
    card('VOLATILITY', r.vol.toFixed(1) + '% / yr'); card('MAX DRAWDOWN', r.mdd.toFixed(1) + '%', 'fx-down'); card('1-DAY VaR 95%', r.var95.toFixed(2) + '%'); card(`BETA vs ${shortOf(bench)}`, finite(r.beta) ? r.beta.toFixed(2) : '—');
    card('CORRELATION', finite(r.corr) ? r.corr.toFixed(2) : '—'); card('1Y RETURN', signed(r.total, 1, '%'), tone(r.total));
    host.append(out, el('p', 'fx-foot', `From ${r.days} daily returns. VaR: on 1 day in 20 the loss was at least this much. Return ÷ volatility ${finite(r.ratio) ? r.ratio.toFixed(2) : '—'}.`));
  }
  async function renderSNews() {
    const host = panel('snews'), s = S.sym; if (!s) return;
    setText('t-snews', `${shortOf(s.symbol)} headlines`);
    if (!S.symNews[s.symbol]) { empty(host, 'Searching headlines…'); try { const r = await fnMarket({op: 'search', q: s.symbol.replace(/=X$|=F$|^\^/g, '')}); S.symNews[s.symbol] = r.news || []; } catch { S.symNews[s.symbol] = []; } if (!$('b-snews') || S.sym?.symbol !== s.symbol) return; host.replaceChildren(); }
    const own = S.symNews[s.symbol].map(n => ({title: n.title, url: n.url, source: n.publisher, publishedAt: n.publishedAt || new Date().toISOString(), external: true}));
    const words = [(s.name || '').replace(/,? (Inc|Corp|Corporation|Ltd|plc|Holdings|Group|N\.V\.|S\.A\.|AG|SE|Co)\.?$/i, '').split(' ').slice(0, 2).join(' '), shortOf(s.symbol).length > 2 ? shortOf(s.symbol) : ''].filter(w => w && w.length > 2).map(w => w.toLowerCase());
    const room = [...S.briefing, ...Object.values(S.desks).flatMap(x => x.items || [])].filter(h => words.some(w => h.title.toLowerCase().includes(w)));
    const seen = new Set(), items = [...room, ...own].filter(h => { const k = h.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    if (!items.length) return empty(host, 'No current headlines for this market.');
    for (const h of items.slice(0, 25)) { if (h.external) { const a = link('', h.url, 'fx-row fx-hrow'); a.append(el('time', '', hhmm(h.publishedAt)), el('span', 'fx-ht', h.title), el('small', '', h.source + ' ↗︎')); host.append(a); } else host.append(headlineRow(h)); }
  }
  async function renderCmp() {
    const host = panel('cmp'), sym = S.sym?.symbol || S.focus, cls = S.sym?.cls || symClass(sym);
    const peers = [sym, benchFor(sym, cls), ...(cls === 'stock' ? ['QQQ'] : cls === 'crypto' ? ['ETH-USD'] : cls === 'fx' ? ['GC=F'] : ['TLT'])].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
    setText('t-cmp', `${peers.map(shortOf).join(' vs ')} · 1Y`);
    const data = await Promise.all(peers.map(p => symHistory(p)));
    if (!$('b-cmp')) return; host.replaceChildren();
    host.append(compareChart(data.map((d, i) => ({label: shortOf(peers[i]), rows: d?.rows || []}))), btn('Compare more and draw ▸', 'fx-chip fx-chip-link', () => openPage('chart', sym)));
  }
  function symbolStoryText() {
    const s = S.sym, q = quoteFor(s.symbol), d = S.symData[s.symbol], rows = d?.rows || [];
    if (!q) return null;
    const lines = [], name = s.name || nameOf(s.symbol), dg = digitsOf(s.symbol);
    const z = finite(q.vol20) && q.vol20 > 0 && finite(q.changePercent) ? Math.abs(q.changePercent) / q.vol20 : null;
    lines.push(`${name} is at ${fmt(q.price, dg)}, ${signed(q.changePercent, 2, '%')} today${z ? `, ${z.toFixed(1)}× its typical daily move` : ''}.`);
    const m1 = perfOf(rows, 21), y1 = perfOf(rows, 251); if (finite(m1)) lines.push(`Over a month it is ${signed(m1, 1, '%')}${finite(y1) ? ` and over a year ${signed(y1, 1, '%')}` : ''}.`);
    if (finite(q.high52) && finite(q.low52)) { const pos = (q.price - q.low52) / (q.high52 - q.low52); lines.push(pos > 0.9 ? 'It trades near its 52-week high.' : pos < 0.1 ? 'It trades near its 52-week low.' : `It sits ${Math.round(pos * 100)}% of the way up its 52-week range.`); }
    const e = (S.earn?.events || []).find(x => x.symbol === s.symbol); if (e) lines.push(`Earnings: ${day(e.date)} ${e.time === 'After close' ? 'after the close' : e.time === 'Before open' ? 'before the open' : ''}${finite(e.epsForecast) ? `, EPS forecast $${e.epsForecast.toFixed(2)}` : ''}.`);
    const u = S.opts?.underlyings?.[s.symbol]; if (u) { const x = u.expiries.find(v => v.dte >= 1) || u.expiries[0]; lines.push(`Options imply a ±${x.movePercent?.toFixed(2)}% move by ${day(x.date)}; put/call volume ${u.putCallVolume?.toFixed(2)}.`); }
    const ev = nextEvents(symCurrencies(s.symbol), 2); if (ev.length) lines.push(`Next on the calendar: ${ev.map(x => `${x.currency} ${x.title} ${new Date(x.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})}`).join('; ')}.`);
    const dir = !finite(q.changePercent) ? 'steady' : q.changePercent > 0.3 ? 'higher' : q.changePercent < -0.3 ? 'lower' : 'little changed';
    return {title: `${shortOf(s.symbol)} ${dir}${z && z >= 1.5 ? ' on a big move' : ''}`, lines};
  }
  function renderSymStory(host) {
    setText('t-story', `${shortOf(S.sym.symbol)} today · ${new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}`);
    const st = symbolStoryText(); if (!st) return empty(host, 'Loading…');
    host.append(el('h3', 'fx-h3', st.title), el('p', 'fx-story', st.lines.join(' ')), el('p', 'fx-foot', 'Written from live prices, history, options and the calendar. Not advice.'));
  }
  function symIntel() {
    const s = S.sym, items = [], q = quoteFor(s.symbol), now = Date.now(), add = (score, tag, title, why, act) => items.push({score: Math.round(Math.max(1, Math.min(99, score))), tag, title, why, act});
    if (q && finite(q.changePercent)) { const z = finite(q.vol20) && q.vol20 ? Math.abs(q.changePercent) / q.vol20 : null; add(30 + (z ?? 1) * 15, 'MOVE', `${shortOf(s.symbol)} ${signed(q.changePercent, 2, '%')} today`, z ? `${z.toFixed(1)}× its typical daily move (20-day)` : 'Today’s change', () => openPage('chart', s.symbol)); }
    if (q && finite(q.high52) && finite(q.low52)) { const pos = (q.price - q.low52) / (q.high52 - q.low52); if (pos > 0.95 || pos < 0.05) add(62, 'LEVEL', `Near its 52-week ${pos > 0.5 ? 'high' : 'low'}`, `52-week range ${fmt(q.low52, 2)}–${fmt(q.high52, 2)}`, () => openPage('chart', s.symbol)); }
    const e = (S.earn?.events || []).find(x => x.symbol === s.symbol); if (e) { const d = (Date.parse(e.date) - now) / 86400000; add(80 - Math.max(0, d) * 4, 'EARN', `Reports ${day(e.date)} ${e.time === 'After close' ? 'after close' : e.time === 'Before open' ? 'before open' : ''}`, `EPS forecast ${finite(e.epsForecast) ? '$' + e.epsForecast.toFixed(2) : '—'} · year ago ${finite(e.lastYearEPS) ? '$' + e.lastYearEPS.toFixed(2) : '—'}`, () => openPage('cal', 'earnings')); }
    const u = S.opts?.underlyings?.[s.symbol]; if (u) { const x = u.expiries.find(v => v.dte >= 1) || u.expiries[0]; add(58, 'OPT', `Options price ±${x.movePercent?.toFixed(2)}% by ${day(x.date)}`, `IV30 ${u.iv30?.toFixed(1)}% · put/call ${u.putCallVolume?.toFixed(2)} · max pain ${fmt(x.maxPain, 0)}`, () => openPage('options', s.symbol)); }
    for (const ev of nextEvents(symCurrencies(s.symbol), 3)) { const h = (Date.parse(ev.time) - now) / 3600000; add(72 - h * 0.6, 'EVENT', `${ev.currency} ${ev.title}`, `${h < 24 ? 'in ' + Math.round(h) + 'h' : new Date(ev.time).toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})}${ev.forecast ? ' · forecast ' + ev.forecast : ''}`, () => openPage('cal')); }
    const edgeM = S.edge?.markets?.find(m => m.symbol === (FX_TO_EDGE[s.symbol] || s.symbol));
    if (edgeM?.positioning?.crowded?.value) add(60, 'COT', `Positioning crowded ${edgeM.positioning.net.value >= 0 ? 'long' : 'short'}`, `CFTC net ${signed(edgeM.positioning.net.value * 100, 0, '%')}`, () => openPage('edge', edgeM.symbol));
    const pair = M.PAIRS.find(p => p.id === (FX_TO_EDGE[s.symbol] || s.symbol)); if (pair) { const b = M.smartBias(pair, {desk: S.desk, edgeMarket: edgeM, livePrice: q?.price}); if (finite(b.score)) add(50 + Math.abs(b.score) / 3, 'BIAS', `Smart Bias ${b.score > 0 ? '+' : ''}${b.score} (${b.label})`, b.components.map(c => `${c.label} ${c.score > 0 ? '+' : ''}${c.score}`).join(' · '), () => openPage('bias', pair.id)); }
    for (const n of (S.symNews[s.symbol] || []).slice(0, 3)) add(55 - (now - Date.parse(n.publishedAt || now)) / 3600000 * 3, 'NEWS', n.title, `${n.publisher} · ${n.publishedAt ? ago(n.publishedAt) : ''}`, () => window.open(n.url, '_blank', 'noopener'));
    return items.sort((a, b) => b.score - a.score);
  }

  /* --- market cards: any symbol, added with + in Edit mode ---------------------------------- */
  async function renderCard(slot, host) {
    const sym = slot.slice(5);
    setText('t-' + slotId(slot), `${shortOf(sym)} · ${nameOf(sym)}`);
    const d = await symHistory(sym, '6mo'); if (!host.isConnected) return; host.replaceChildren();
    const q = quoteFor(sym); if (!q || !d?.rows?.length) return empty(host, 'This market is unavailable right now.');
    setText('t-' + slotId(slot), `${shortOf(sym)} · ${d.name || nameOf(sym)}`);
    const top = el('div', 'fx-sqhead'); top.append(el('b', '', fmt(q.price, digitsOf(sym))), el('em', tone(q.changePercent), signed(q.changePercent, 2, '%')), el('small', '', d.exchange || ''));
    host.append(top, lineChart(d.rows.slice(-126), {digits: digitsOf(sym), W: 420, H: 150, label: nameOf(sym), last: q.price, source: 'Yahoo Finance (delayed) · 6 months'}));
    const p = el('div', 'fx-perfrow'); for (const [n, l] of [[5, '1W'], [21, '1M'], [63, '3M'], [125, '6M']]) { const v = perfOf(d.rows, n); const x = el('span'); x.append(el('small', '', l), el('b', tone(v), finite(v) ? signed(v, 1, '%') : '—')); p.append(x); }
    host.append(p, btn(`Load the desk for ${shortOf(sym)} ▸`, 'fx-chip fx-chip-link', () => setSymbol({symbol: sym, name: d.name})));
  }

  /* --- Finder: search every listed market ------------------------------------------------------ */
  async function loadSymbolDirectory() {
    if (S.symbols) return S.symbols;
    try { const d = await getJSON(WDATA + 'symbols.json', {bust: true, timeout: 30000}); if (Array.isArray(d?.rows)) S.symbols = d; } catch (e) { report('symbols', e); }
    return S.symbols;
  }
  const WDATA = 'https://raw.githubusercontent.com/EA-LA/FYNX-web/world-data/';
  function localMatches(q) {
    const u = q.toUpperCase(), l = q.toLowerCase(), out = [], seen = new Set();
    const push = (symbol, name, type, exchange, extra) => { if (seen.has(symbol)) return; seen.add(symbol); out.push({symbol, name, type, exchange, ...extra}); };
    const pool = [...CATALOG.map(c => [c.symbol, c.name, c.group]), ...Object.values(MKQ()).map(x => [x.symbol, x.name, x.group]), ...Object.entries(EDGE).map(([k, v]) => [k, v[0], 'Edge'])];
    for (const [sy, n, g] of pool) if (sy.toUpperCase() === u || shortOf(sy) === u) push(sy, n, g, 'FYNX terminal', {rank: 0});
    for (const [sy, n, g] of pool) if (shortOf(sy).startsWith(u) || n.toLowerCase().includes(l)) push(sy, n, g, 'FYNX terminal', {rank: 1});
    for (const [sy, n, t, x] of S.symbols?.rows || []) { if (out.length > 60) break; if (sy === u) push(sy, n, t, x, {rank: 0, isNew: (S.symbols.firstSeen?.[sy] || '') >= newCut()}); }
    for (const [sy, n, t, x] of S.symbols?.rows || []) { if (out.length > 60) break; if (sy.startsWith(u) || (l.length > 2 && n.toLowerCase().includes(l))) push(sy, n, t, x, {rank: sy.startsWith(u) ? 1 : 2, isNew: (S.symbols.firstSeen?.[sy] || '') >= newCut()}); }
    return out.sort((a, b) => a.rank - b.rank);
  }
  const newCut = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  let finderPick = null, finderTimer = 0;
  function openFinder({onPick = setSymbol, title = 'Find any market'} = {}) {
    finderPick = onPick; const dlg = $('fx-finder'), input = $('fx-finder-input');
    $('fx-finder-title').textContent = title; input.value = ''; renderFinder('');
    if (!dlg.open) dlg.showModal(); input.focus(); loadSymbolDirectory().then(() => renderFinder(input.value));
  }
  function finderRow(r, i) {
    const b = rowButton('fx-find' + (i === 0 ? ' sel' : ''), () => { $('fx-finder').close(); finderPick?.({symbol: r.symbol, name: r.name, type: r.type, exchange: r.exchange}); }, `${r.symbol} ${r.name}`);
    const t = String(r.type || '').toUpperCase(), badge = /EQUITY|STOCK/.test(t) ? 'STOCK' : /ETF|FUND/.test(t) ? 'FUND' : /CRYPTO/.test(t) ? 'CRYPTO' : /CURRENCY|FX/.test(t) ? 'FX' : /FUT/.test(t) ? 'FUTURE' : /INDEX|INDICES|AMERICAS|EUROPE|ASIA/.test(t) ? 'INDEX' : t.slice(0, 8) || 'MARKET';
    const n = el('span', 'fx-sym'); n.append(el('b', '', r.symbol), el('small', '', r.name));
    b.append(n, el('span', 'fx-badge', badge), el('span', 'fx-dim', r.exchange || ''), r.isNew ? el('span', 'fx-badge fx-new', 'NEW') : el('span'));
    return b;
  }
  async function renderFinder(q) {
    const host = $('fx-finder-list'); host.replaceChildren(); q = q.trim();
    if (!q) {
      host.append(el('p', 'fx-sub', 'Type a company, ticker, currency, coin, index or future. Results cover the terminal’s markets, every US-listed stock and ETF, and exchanges worldwide.'));
      const fresh = S.symbols?.newListings?.slice(0, 12) || [];
      if (fresh.length) { host.append(el('div', 'fx-th1', `NEW LISTINGS · scanned daily (${S.symbols.newListings.length} in 30 days)`)); fresh.forEach((r, i) => host.append(finderRow({...r, isNew: true}, i + 1))); host.append(btn('All new listings ▸', 'fx-chip fx-chip-link', () => { $('fx-finder').close(); openPage('listings'); })); }
      return;
    }
    const local = localMatches(q).slice(0, 25);
    if (local.length) { host.append(el('div', 'fx-th1', 'MATCHES')); local.forEach((r, i) => host.append(finderRow(r, i))); }
    const wait = el('p', 'fx-sub', 'Searching exchanges worldwide…'); host.append(wait);
    clearTimeout(finderTimer);
    finderTimer = setTimeout(async () => {
      try {
        const r = await fnMarket({op: 'search', q}, 9000); if ($('fx-finder-input').value.trim() !== q) return;
        const have = new Set(local.map(x => x.symbol)), more = (r.quotes || []).filter(x => !have.has(x.symbol));
        wait.replaceWith(el('div', 'fx-th1', `WORLDWIDE · ${more.length} more`)); more.forEach((x, i) => host.append(finderRow(x, local.length + i)));
      } catch { wait.textContent = 'Worldwide search is unavailable right now; local matches are shown.'; }
    }, 250);
  }
  $('fx-finder-input').addEventListener('input', e => renderFinder(e.target.value));
  $('fx-finder-form').addEventListener('submit', e => { e.preventDefault(); $('fx-finder-list').querySelector('.fx-find')?.click(); });
  $('fx-finder-close').addEventListener('click', () => $('fx-finder').close());
  $('fx-find-btn').addEventListener('click', () => openFinder());

  async function setSymbol(meta) {
    const symbol = String(meta?.symbol || '').trim(); if (!symbol) return;
    const id = FX_TO_EDGE[symbol] && EDGE[FX_TO_EDGE[symbol]] ? symbol : symbol;
    S.sym = {symbol: id, name: meta.name || nameOf(id), type: meta.type || null, exchange: meta.exchange || null, cls: symClass(id, meta.type)};
    S.focus = FX_TO_EDGE[id] || id; S.mktTab = null; if (S.sym.cls === 'stock') S.finTicker = id.replace('.', '-');
    if (S.opts?.underlyings?.[id]) { S.optSym = id; S.optExp = 0; }
    const u = new URL(location.href); u.searchParams.set('sym', id); history.replaceState(history.state, '', u);
    store.set('sym', JSON.stringify(S.sym));
    say(`Loading ${id}…`); PG?.closeAll();
    renderDeskBar(); buildGrid(); renderAll();
    const d = await symHistory(id);
    if (S.sym?.symbol !== id) return;
    if (d?.name && !meta.name) S.sym.name = d.name;
    if (d?.rows?.length && !EDGE[S.focus]) S.history[id] = {source: d.source || 'Yahoo Finance', rows: d.rows};
    S.sym.cls = symClass(id, meta.type || d?.type); document.title = `FYNX Terminal · ${shortOf(id)}`;
    renderDeskBar(); buildGrid(); renderAll(); say(d ? `${shortOf(id)} loaded: every box shows this market` : `${id}: no data found`);
    await loadSeries(S.focus); R('focus');
  }
  function clearSymbol() { S.sym = null; store.set('sym', ''); const u = new URL(location.href); u.searchParams.delete('sym'); history.replaceState(history.state, '', u); setDesk(S.deskKey); }

  /* --- layout: desk bar, editable panels --------------------------------------------------------- */
  const RENDER = {mkts: renderMkts, focus: renderFocus, heat: renderHeat, fin: renderFin, story: renderStory, intel: renderIntel, top: renderTop, desks: () => renderDesks(), cb: renderCB, curve: renderCurve, vix: renderRisk, bias: renderBias,
    edge: renderEdge, pos: renderPos, eco: renderEco, corr: () => renderCorr(), tools: renderTools, movers: renderMovers, xa: renderXA, idx: renderIdx, sess: renderSess, earn: renderEarn, opt: renderOpt, optlist: renderOptList, chain: renderChain,
    active: renderActive, term: renderTerm, rates: renderRates, gov: renderGov, books: renderBooks, range: () => renderRange(), perf: renderPerf, official: renderOfficial,
    squote: renderSQuote, srisk: () => renderSRisk(), snews: () => renderSNews(), cmp: () => renderCmp()};
  Object.assign(PANELS, {squote: ['QUOTE', 'Quote & performance', 'des'], srisk: ['RISK', 'Risk', 'port'], snews: ['NEWS', 'Headlines', 'news'], cmp: ['CMP', 'Compare', 'chart']});
  Object.assign(LINK_LABEL, {chart: 'Chart', port: 'Portfolio', ctry: 'Country', world: 'World'});
  const TABBED = new Set(['mkts', 'focus', 'desks', 'curve', 'eco', 'corr', 'tools', 'perf', 'chain']);
  const PANEL_GROUPS = [
    ['Markets', ['mkts', 'focus', 'squote', 'cmp', 'movers', 'heat', 'perf', 'xa', 'idx', 'srisk']],
    ['News & intelligence', ['intel', 'story', 'top', 'desks', 'snews', 'official']],
    ['Rates & macro', ['cb', 'curve', 'gov', 'rates', 'eco', 'bias', 'corr', 'sess']],
    ['Positioning & volatility', ['edge', 'pos', 'range', 'term', 'vix']],
    ['Stocks & options', ['fin', 'earn', 'opt', 'optlist', 'chain', 'active', 'books']],
    ['Your tools', ['tools']]
  ];
  const PANEL_DESC = {mkts: 'Watchlist with live prices', focus: 'Daily chart of the selected market', squote: 'Quote, ranges and performance for the selected market', cmp: 'Performance vs benchmarks', movers: 'Biggest gainers and losers', heat: 'Day-change heat map', perf: '1W to 1Y performance bars', xa: 'Cross-asset prices', idx: 'Index and sector funds', srisk: 'Volatility, beta, drawdown, VaR',
    intel: 'Ranked: what matters now', story: 'Today’s story in plain words', top: 'Latest headlines', desks: 'News by desk', snews: 'Headlines for the selected market', official: 'Central bank and statistics releases',
    cb: 'Policy rates, next decisions, Fed odds', curve: 'Government yield curves', gov: 'US, euro area, UK, Japan yields', rates: 'Policy rates worldwide', eco: 'Economic calendar', bias: 'Smart Bias by FX pair', corr: 'FX correlation matrix', sess: 'Market sessions',
    edge: 'Market regimes', pos: 'CFTC futures positioning', range: 'Daily range distribution', term: 'Volatility term structure', vix: 'VIX, mood, crypto book', fin: 'SEC annual financials', earn: 'Earnings calendar', opt: 'Options summary', optlist: 'Options monitor', chain: 'Option chain', active: 'Most active contracts', books: 'Crypto top of book', tools: 'Calculators, journal, sessions'};
  const slotId = slot => slot.startsWith('card:') ? 'card-' + slot.slice(5).replace(/[^A-Za-z0-9]/g, '_') : slot;
  const layoutKey = () => S.sym ? 'sym-' + S.sym.cls : S.deskKey;
  function getSlots() {
    try { const v = JSON.parse(store.get('layout-' + layoutKey()) || 'null'); if (Array.isArray(v) && v.length && v.length <= 28 && v.every(x => x === null || (typeof x === 'string' && (PANELS[x] || /^card:[A-Za-z0-9.\-=^&]{1,24}$/.test(x))))) return v; } catch {}
    return [...D().slots];
  }
  function setSlots(v) { store.set('layout-' + layoutKey(), JSON.stringify(v)); buildGrid(); renderAll(); }
  function renderSlot(slot) {
    if (!slot) return;
    if (slot.startsWith('card:')) { const host = $('b-' + slotId(slot)); if (host) renderCard(slot, host).catch(e => report('card', e)); return; }
    R(slot);
  }
  function R(...kinds) { for (const k of kinds) if ($('tp-' + k) && RENDER[k]) { try { const r = RENDER[k](); if (r?.catch) r.catch(e => report('render-' + k, e)); } catch (e) { report('render-' + k, e); } } }
  function gridAreas(n) {
    const g = D().grid, base = g ? g.areas : ['s1 s2 s3 s4 s5 s6', 's1 s2 s7 s8 s9 s10', 's11 s12 s13 s14 s15 s16'];
    const names = new Set(base.join(' ').split(/\s+/)), rows = [...base];
    for (let i = names.size + 1; i <= n; i += 6) rows.push(Array.from({length: 6}, (_, k) => 's' + Math.min(i + k, n)).join(' '));
    return {rows, base: names.size, cols: g?.cols || ''};
  }
  function buildGrid() {
    const main = $('fx-main'), keep = [...main.children].filter(n => !n.classList.contains('tp'));
    const slots = getSlots(), {rows, base, cols} = gridAreas(slots.length);
    main.replaceChildren(...keep);
    main.dataset.desk = S.sym ? 'sym' : S.deskKey;
    main.style.setProperty('--fx-areas', rows.map(r => `"${r}"`).join(' '));
    main.style.setProperty('--fx-rows', rows.length > 3 ? `repeat(${rows.length}, minmax(270px, 1fr))` : `repeat(${rows.length}, minmax(0, 1fr))`); main.dataset.tall = rows.length > 3 ? '1' : '';
    if (cols) main.style.setProperty('--fx-cols', cols); else main.style.removeProperty('--fx-cols');
    main.classList.toggle('fx-editing', S.editing);
    const used = new Set();
    slots.forEach((slot, i) => {
      if (slot && used.has(slot)) slot = null; if (slot) used.add(slot);
      const area = 's' + (i + 1);
      if (!slot) {
        const sec = el('section', 'tp tp-empty'); sec.style.gridArea = area; if (i >= base) sec.dataset.extra = '1';
        if (S.editing) sec.append(btn('+ Add panel', 'fx-addpanel', () => openPicker(i), 'Add a panel here'));
        main.append(sec); return;
      }
      const card = slot.startsWith('card:'), kind = card ? 'card' : slot, id = slotId(slot);
      const [code, title, page] = card ? ['CARD', shortOf(slot.slice(5)), 'des'] : PANELS[slot];
      const sec = el('section', 'tp' + (['story', 'intel'].includes(kind) ? ' tp-accent' : '')); sec.id = 'tp-' + id; sec.style.gridArea = area; sec.setAttribute('aria-labelledby', 'h-' + id); if (i >= base) sec.dataset.extra = '1';
      const head = el('header'), h2 = el('h2'); h2.id = 'h-' + id; const t = el('span', '', title); t.id = 't-' + id; h2.append(el('b', '', code), t); head.append(h2);
      const right = el('div', 'tp-right');
      if (S.editing) {
        right.append(btn('◀', 'fx-ed', () => { const v = getSlots(); if (i > 0) { [v[i - 1], v[i]] = [v[i], v[i - 1]]; setSlots(v); } }, 'Move earlier'), btn('▶', 'fx-ed', () => { const v = getSlots(); if (i < v.length - 1) { [v[i + 1], v[i]] = [v[i], v[i + 1]]; setSlots(v); } }, 'Move later'),
          btn('Change', 'fx-ed', () => openPicker(i), 'Replace this panel'), btn('✕', 'fx-ed fx-ed-x', () => { const v = getSlots(); v[i] = null; setSlots(v); }, 'Remove this panel'));
      } else {
        if (TABBED.has(kind)) { const tb = el('div', 'tp-tabs'); tb.id = kind + '-tabs'; tb.setAttribute('aria-label', title + ' options'); right.append(tb); }
        const note = el('span', 'tp-note'); note.id = 'n-' + id; right.append(note);
        if (page) right.append(btn((LINK_LABEL[page] || 'Open') + ' ▸', 'tp-link', () => openPage(page, card ? slot.slice(5) : page === 'fa' ? S.finTicker : page === 'des' || page === 'chart' ? (S.sym?.symbol || S.focus) : page === 'options' ? S.optSym : page === 'edge' && kind === 'range' ? D().range : undefined), `Open ${title} full page`));
      }
      head.append(right);
      const body = el('div', 'tp-b' + (['focus', 'curve', 'globe'].includes(kind) ? ' tp-flex' : '')); body.id = 'b-' + id;
      sec.append(head, body); main.append(sec);
    });
    $('fx-editbar').hidden = !S.editing;
    if (S.editing) $('fx-editbar-text').textContent = `Editing the ${S.sym ? shortOf(S.sym.symbol) + ' (' + S.sym.cls + ')' : D().label} layout · ◀ ▶ move · Change swaps · ✕ removes · + adds any panel or a card for any market`;
  }
  /* Panel picker */
  let pickSlot = 0;
  function openPicker(i) {
    pickSlot = i; const dlg = $('fx-picker'), q = $('fx-picker-q'); q.value = ''; drawPicker(''); dlg.showModal(); q.focus();
  }
  function drawPicker(q) {
    const host = $('fx-picker-list'), l = q.trim().toLowerCase(), used = new Set(getSlots().filter(Boolean)); host.replaceChildren();
    const cardBtn = btn('', 'fx-pick fx-pick-card', () => { $('fx-picker').close(); openFinder({title: 'Add a card for any market', onPick: m => { const v = getSlots(); v[pickSlot] = 'card:' + m.symbol; setSlots(v); }}); });
    cardBtn.append(el('b', '', '+ MARKET CARD'), el('span', '', 'Any stock, fund, currency, coin, index or future worldwide'), el('small', '', 'Pick the market, it gets its own box'));
    host.append(cardBtn);
    for (const [g, kinds] of [...PANEL_GROUPS, ...EXTRA_GROUPS]) {
      const list = kinds.filter(k => PANELS[k] && (!l || (PANELS[k][0] + ' ' + PANELS[k][1] + ' ' + (PANEL_DESC[k] || '')).toLowerCase().includes(l)));
      if (!list.length) continue;
      const sec = el('section', 'fx-pickgrp'); sec.append(el('h3', '', g));
      const grid = el('div', 'fx-pickgrid');
      for (const k of list) { const b = btn('', 'fx-pick' + (used.has(k) ? ' used' : ''), () => { const v = getSlots(); const at = v.indexOf(k); if (at >= 0) v[at] = null; v[pickSlot] = k; $('fx-picker').close(); setSlots(v); }, `${PANELS[k][1]}`); b.append(el('b', '', PANELS[k][0]), el('span', '', PANELS[k][1]), el('small', '', (PANEL_DESC[k] || '') + (used.has(k) ? ' · on screen (moves here)' : ''))); grid.append(b); }
      sec.append(grid); host.append(sec);
    }
  }
  $('fx-picker-q').addEventListener('input', e => drawPicker(e.target.value));
  $('fx-picker-close').addEventListener('click', () => $('fx-picker').close());
  $('fx-edit').addEventListener('click', () => { S.editing = !S.editing; $('fx-edit').setAttribute('aria-pressed', String(S.editing)); $('fx-edit').textContent = S.editing ? 'Done' : 'Edit'; buildGrid(); renderAll(); });
  $('fx-ed-done').addEventListener('click', () => $('fx-edit').click());
  $('fx-ed-row').addEventListener('click', () => { const v = getSlots(); if (v.length + 6 > 28) return say('Up to 28 boxes.'); setSlots([...v, ...Array(6).fill(null)]); });
  $('fx-ed-unrow').addEventListener('click', () => { const v = getSlots(), {base} = gridAreas(v.length); if (v.length <= base) return say('This is the smallest layout.'); setSlots(v.slice(0, Math.max(base, v.length - 6))); });
  $('fx-ed-reset').addEventListener('click', () => { store.set('layout-' + layoutKey(), ''); buildGrid(); renderAll(); say('Layout reset'); });
  const EXTRA_GROUPS = [];
  function renderDeskBar() {
    const host = $('fx-deskbar-list'); host.replaceChildren();
    for (const k of DESK_ORDER) { const b = btn(DESK_DEFS[k].label, 'fx-desk' + (k === S.deskKey && !S.sym ? ' on' : k === S.deskKey ? ' base' : ''), () => { if (S.sym) { S.sym = null; store.set('sym', ''); const u = new URL(location.href); u.searchParams.delete('sym'); history.replaceState(history.state, '', u); } setDesk(k); }, `${DESK_DEFS[k].label} desk`); b.setAttribute('aria-pressed', String(k === S.deskKey && !S.sym)); host.append(b); }
    const chip = $('fx-symchip'); chip.replaceChildren(); chip.hidden = !S.sym;
    if (S.sym) { chip.append(el('b', '', shortOf(S.sym.symbol)), el('span', '', S.sym.name || ''), btn('✕', 'fx-symx', clearSymbol, `Close ${S.sym.symbol}, back to the ${D().label} desk`)); }
    setText('fx-deskbar-note', S.sym ? `Every box shows ${shortOf(S.sym.symbol)}` : `FYNX Intelligence ranking ${Object.keys(S.feeds).length || 'the'} live feeds for ${D().who}`);
    const on = host.querySelector('.on'); if (on && host.scrollWidth > host.clientWidth) on.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }
  async function setDesk(key, {initial = false} = {}) {
    if (!DESK_DEFS[key]) key = 'all';
    if (!initial) PG?.closeAll();
    S.deskKey = key; store.set('desk', key);
    const d = D(); S.mktTab = null; S.focus = resolve(d.focus) || d.focus; S.tool = 'calc'; if (d.opt) { S.optSym = d.opt; S.optExp = 0; } if (d.newsTabs) S.deskTab = d.newsTabs[0];
    if (info(S.focus).group === 'Stocks') S.finTicker = S.focus;
    if (!initial) { const u = new URL(location.href); if (key === 'all') u.searchParams.delete('desk'); else u.searchParams.set('desk', key); history.replaceState(history.state, '', u); }
    document.title = `FYNX Terminal · ${d.label} desk`;
    renderDeskBar(); buildGrid(); renderStrip(); renderNews();
    renderAll(); say(`${d.label} desk loaded`);
    if (initial) return;
    await Promise.allSettled([loadSeries(S.focus), d.news !== 'all' ? loadNews(d.news) : null, getSlots().includes('books') ? loadBooks(['BTC-USD', 'ETH-USD']) : null, d.onLoad?.()]);
    R('focus', 'top', 'intel', 'books', 'story'); renderNews(); R('desks'); d.afterLoad?.();
  }


  /* --- command bar & keys --------------------------------------------------- */
  let PG = null;
  function openPage(name, arg) { if (PG) PG.open(name, arg); else say('Loading…'); }
  function say(text) { const n = $('fx-cmd-msg'); if (n) n.textContent = text; }
  // On stacked (phone/tablet) layouts the panel a command changes is usually off-screen; bring it into view.
  function reveal(id) { if (window.innerWidth < 1100) $(id)?.scrollIntoView({behavior: 'smooth', block: 'start'}); }
  const PAGES = ['HELP', 'NEWS', 'MKTS', 'MACRO', 'EDGE', 'INTEL', 'RESEARCH', 'JOURNAL', 'CALC', 'CAL', 'OPTIONS', 'VOL', 'BIAS', 'SOURCES'];
  function run(cmd) {
    const parts = cmd.trim().toUpperCase().split(/\s+/), [verb, arg] = parts, rest = cmd.trim().split(/\s+/).slice(1).join(' ');
    if (!verb) return;
    if (verb === 'HELP' || verb === '?') { openPage('help'); return say('Commands and keys'); }
    if (verb === 'DESK' || DESK_DEFS[verb.toLowerCase()] && !resolve(verb)) { const k = (verb === 'DESK' ? arg : verb || '').toLowerCase(); if (DESK_DEFS[k]) { setDesk(k); return; } return say('Desks: ' + DESK_ORDER.map(k => DESK_DEFS[k].label).join(', ')); }
    if (verb === 'NEWS' || verb === 'N') { const c = NEWS_CATS.find(([k, l]) => k.toUpperCase() === arg || l.toUpperCase() === arg); if (c) { openPage('news', {cat: c[0]}); return say(`News: ${c[1]}`); } openPage('news', rest ? {q: rest} : undefined); return say(rest ? `News search: ${rest}` : 'All news'); }
    if (verb === 'CURVE') { const a = {US: 'US', EA: 'EA', EU: 'EA', UK: 'GB', GB: 'GB', JP: 'JP', JAPAN: 'JP'}[arg || 'US']; if (a) { setCurve(a); return say('Curve: ' + M.AREAS[a].short); } return say('Use CURVE US, EA, UK or JP.'); }
    if (verb === 'CB') { const b = S.schedule?.banks?.find(x => x.short.toUpperCase() === arg || x.currency === arg); if (b) { openPage('cb', b.short); return say(b.name); } return say('Use CB FED, ECB, BOE, BOJ, SNB, BOC, RBA or RBNZ.'); }
    if ((verb === 'FIN' || verb === 'FA') && arg) { openPage('fa', arg); return say('Financials: ' + arg); }
    if (verb === 'DES' && arg) { const id = resolve(rest) || arg; openPage('des', id); return say('Description: ' + nameOf(id)); }
    if (verb === 'OPT' || verb === 'OMON') { const s = arg && OPT()[arg] ? arg : S.optSym; openPage('options', s); return say(`Options: ${s}`); }
    if (verb === 'CORR') { const w = Number(arg); if ([30, 60, 90].includes(w)) { S.corrWindow = w; R('corr'); renderCorr(true); reveal('tp-corr'); return say(`Correlation: ${w} days`); } return say('Use CORR 30, 60 or 90.'); }
    if (verb === 'CALC') { const id = resolve(arg); openPage('calc', id && EDGE[id] ? {kind: 'fx', pair: id} : {kind: D().calc}); return say('Calculators'); }
    if (verb === 'GO') { if (PAGES.includes(arg)) { openPage(arg.toLowerCase()); return; } return say('Pages: ' + PAGES.join(', ')); }
    if (PAGES.includes(verb)) { openPage(verb.toLowerCase(), rest || undefined); return say(verb); }
    if (verb === 'SYM' || verb === 'LOAD') { if (arg) { setSymbol({symbol: resolve(rest) || rest.toUpperCase()}); return; } return openFinder(); }
    if (verb === 'FIND' || verb === 'SEARCH') { openFinder(); if (rest) { $('fx-finder-input').value = rest; renderFinder(rest); } return; }
    if (verb === 'EDIT') { $('fx-edit').click(); return; }
    if (verb === 'ALLDESK' || verb === 'CLEAR') { if (S.sym) clearSymbol(); return; }
    const id = resolve(cmd);
    if (id) { setSymbol({symbol: EDGE_TO_FX[id] || id}); return say(`${nameOf(id)}: loading every box`); }
    if (/^[A-Za-z0-9.\-=^&]{1,24}$/.test(cmd.trim())) { setSymbol({symbol: cmd.trim().toUpperCase()}); return; }
    openFinder(); $('fx-finder-input').value = cmd; renderFinder(cmd);
  }
  $('fx-cmd-form').addEventListener('submit', e => { e.preventDefault(); const i = $('fx-command'); run(i.value); i.value = ''; });
  const KEYS = [['F1', 'Help', 'help'], ['F2', 'News', 'news'], ['F3', 'Markets', 'mkts'], ['F4', 'Macro', 'macro'], ['F5', 'Edge', 'edge'], ['F6', 'Intel', 'intel'], ['F7', 'Research', 'research'], ['F8', 'Journal', 'journal'], ['F9', 'Calc', 'calc'], ['F10', 'Calendar', 'cal'], ['F11', 'Options', 'options'], ['F12', 'Vol', 'vol']];
  function renderKeys() { const host = $('fx-keys'); host.replaceChildren(); KEYS.forEach(([k, l, p]) => { const b = btn('', 'fx-key', () => openPage(p), `${k} ${l}`); b.append(el('b', '', k), document.createTextNode(l)); host.append(b); }); }
  document.addEventListener('keydown', e => {
    const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (e.key === 'Escape') { if (!$('fx-inspect').hidden) { $('fx-inspect').hidden = true; return; } if (PG?.isOpen()) { PG.back(); return; } }
    if (e.key === '/' && !typing) { e.preventDefault(); $('fx-command').focus(); }
    // Function keys open terminal pages; F5, F11 and F12 keep their browser meaning (reload, full screen, dev tools).
    const k = KEYS.find(x => x[0] === e.key); if (k && !['F5', 'F11', 'F12'].includes(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openPage(k[2]); }
  });
  $('fx-news-pause').addEventListener('click', e => { S.paused = !S.paused; e.currentTarget.setAttribute('aria-pressed', String(S.paused)); e.currentTarget.textContent = S.paused ? 'Play' : 'Pause'; $('fx-news-track').classList.toggle('paused', S.paused); });
  $('fx-live').addEventListener('click', () => openPage('sources'));
  $('fx-brand').addEventListener('click', () => { PG?.closeAll(); setDesk('all'); });
  try { const ref = document.referrer && new URL(document.referrer); if (ref && ref.origin === location.origin && !ref.pathname.startsWith('/terminal')) $('fx-classic').href = ref.pathname + ref.search; } catch {}

  /* --- orchestration -------------------------------------------------------- */
  const renderQuotesAll = () => { renderStrip(); R('mkts', 'heat', 'bias', 'movers', 'xa', 'idx', 'perf', 'intel', 'term', 'sess'); if (S.focus) R('focus'); };
  function renderAll() { renderClocks(); renderStrip(); renderNews(); for (const k of getSlots()) renderSlot(k); renderLive(); }

  const CORE = {S, M, $, el, btn, link, svg, kv, inspect, signed, tone, ago, hhmm, day, fmt, big, count, finite, empty, rowButton, tabs, say,
    CATALOG, EDGE, FX_TO_EDGE, EDGE_TO_FX, NEWS_CATS, DESK_DEFS, DESK_ORDER, SESSIONS, EXCHANGES, FUTSPEC, KEYS, CALC_TITLE,
    info, nameOf, shortOf, quoteFor, stat, digitsOf, universe, resolve, focusOn, setDesk, setSymbol, clearSymbol, openFinder, symHistory, fnMarket, riskStats, compareChart, benchFor, symClass, perfOf, volOf, getSlots, PANELS, PANEL_DESC, EXTRA_GROUPS, LINK_LABEL, RENDER, TABBED, store, TDATA, WDATA, MKQ, report, setText, panel, nextEvents, buildGrid, renderDeskBar, lineChart, curveChart, tenorGrid, finTable, headlineRow, quoteRow, ecoRow, intelItems, intelRow, biasRows, trendPos, optSummary, chainTable, calculator, renderJournal, sessionRows, periodReturn, setCurve,
    loadSeries, loadFin, loadDirectory, loadNews, loadBriefing, getJSON, D, R, run, renderAll, PAGE_NAMES: PAGES, openPage};
  PG = window.FynxTerminalPages ? window.FynxTerminalPages(CORE) : null;
  CORE.PG = PG;
  // Plugins (World desk, portfolio, charts) add panels, desks and pages through CORE.
  for (const plug of window.FynxTerminalPlugins || []) { try { plug(CORE, PG); } catch (e) { report('plugin', e); } }

  async function start() {
    const params = new URLSearchParams(location.search);
    const want = (params.get('desk') || store.get('desk') || 'all').toLowerCase();
    renderKeys(); renderClocks();
    await setDesk(DESK_DEFS[want] ? want : 'all', {initial: true});
    if (params.get('symbol')) S.focus = resolve(params.get('symbol')) || S.focus;
    if (params.get('sym')) setSymbol({symbol: params.get('sym')});
    PG?.fromLocation();
    const d = D();
    await Promise.allSettled([loadQuotes(), loadMarkets(), loadDesk(), loadSchedule(), loadEdge(), loadCalendar(), loadBriefing(), loadVix(), loadCorr(), loadBooks(getSlots().includes('books') ? ['BTC-USD', 'ETH-USD'] : ['BTC-USD', 'ETH-USD']), loadOptions(), loadEarnings(), d.news !== 'all' ? loadNews(d.news) : null]);
    await loadSeries(S.focus);
    renderDeskBar(); renderAll(); $('fx-main').setAttribute('aria-busy', 'false');
    PG?.rerender();
    window.FYNXNewsReaderData?.remember?.(S.briefing);
  }
  const every = (ms, task) => setInterval(async () => { if (!document.hidden) await task(); }, ms);
  every(30000, async () => { await loadQuotes(); renderQuotesAll(); R('story'); });
  every(15000, async () => { if (!getSlots().includes('books') && S.deskKey !== 'all') return; await loadBooks(getSlots().includes('books') ? ['BTC-USD', 'ETH-USD'] : ['BTC-USD', 'ETH-USD']); R('vix', 'books'); });
  every(30000, () => { renderClocks(); R('cb', 'sess'); });
  every(120000, async () => { await Promise.allSettled([loadBriefing(), D().news !== 'all' ? loadNews(D().news, true) : null]); renderNews(); R('top', 'story', 'intel', 'official'); });
  every(300000, async () => { await Promise.allSettled([loadDesk(), loadMarkets(), loadOptions(), loadNews(S.deskTab, true)]); renderQuotesAll(); R('cb', 'curve', 'gov', 'rates', 'story', 'bias', 'desks', 'opt', 'optlist', 'chain', 'active', 'intel'); renderStrip(); });
  every(1800000, async () => { await Promise.allSettled([loadEdge(), loadCalendar(), loadVix(), loadEarnings()]); R('edge', 'pos', 'eco', 'vix', 'earn', 'intel'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadQuotes().then(renderQuotesAll); loadBriefing().then(() => { renderNews(); R('top', 'intel'); }); } });
  start();
})();
