import { SYMBOLS } from './config';

export const QUANT_STEPS = ['backtest', 'optimize', 'portfolio', 'montecarlo', 'ftmo', 'deploy'] as const;
export type QuantStep = typeof QUANT_STEPS[number];
export type QuantTimeframe = 'M1' | 'M5' | 'H1' | 'H4' | 'D1' | 'tick';
export interface QuantCommand {
  symbol: string;
  timeframe: QuantTimeframe;
  dataType: 'close' | 'ohlc' | 'tick';
  years: number;
  steps: QuantStep[];
  paths: number;
  warnings: string[];
}
export interface CommandParser { parse(text: string, defaults?: Partial<QuantCommand>): Promise<QuantCommand> }

/** Rules-only parser: deterministic, local, and replaceable by a server-only adapter. */
export function parseAsk(text: string, defaults: Partial<QuantCommand> = {}): QuantCommand {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Enter a research request first.');
  if (text.length > 4000) throw new Error('Keep the request below 4,000 characters.');
  const value = text.toLowerCase().replace(/backrest|backtes\b/g, 'backtest').replace(/chllange|challange|chalenge/g, 'challenge').replace(/optimise/g, 'optimize');
  const compact = value.replace(/([a-z]{3})\s*[/_-]\s*([a-z]{3})/g, '$1$2');
  const matches = SYMBOLS.map(s => ({ symbol: s.id, at: Math.min(...[s.id, s.symbol, ...(s.aliases || [])].map(alias => {
    const key = alias.toLowerCase().replace(/[/_-]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const exp = new RegExp('\\b' + key + '\\b');
    const m = exp.exec(compact);
    return m ? m.index : Infinity;
  })) })).filter(s => Number.isFinite(s.at)).sort((a,b) => a.at-b.at);
  const warnings: string[] = [];
  if (matches.length > 1) warnings.push('Several markets were mentioned. The first market is selected; add the others in Portfolio.');
  let timeframe: QuantTimeframe = defaults.timeframe || 'D1';
  if (/\bticks?\b/.test(value)) timeframe = 'tick';
  else if (/\b(1m|m1|1[- ]?min(?:ute)?s?)\b/.test(value)) timeframe = 'M1';
  else if (/\b(5m|m5|5[- ]?min(?:ute)?s?)\b/.test(value)) timeframe = 'M5';
  else if (/\b(1h|h1|hourly|1[- ]?hours?)\b/.test(value)) timeframe = 'H1';
  else if (/\b(4h|h4|4[- ]?hours?)\b/.test(value)) timeframe = 'H4';
  else if (/\b(daily|d1|1d|day[- ]?bars?)\b/.test(value)) timeframe = 'D1';
  const history = /\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/.exec(value);
  const years = history ? Number(history[1]) : (defaults.years ?? 10);
  if (!Number.isFinite(years) || years <= 0 || years > 50) throw new Error('History must be greater than 0 and no more than 50 years.');
  const pathMatch = /\b([\d,.]+)\s*(?:monte\s*carlo\s*)?(?:paths?|attempts?|simulations?)\b/.exec(value);
  if(pathMatch && /[,.]/.test(pathMatch[1]) && !/^\d{1,3}(?:[,.]\d{3})+$/.test(pathMatch[1]))throw new Error('Use a whole number of paths; thousands may be separated by commas or dots.');
  let paths = pathMatch ? Number(pathMatch[1].replace(/[,.]/g, '')) : (defaults.paths ?? 2000);
  if (!Number.isInteger(paths) || paths < 1) throw new Error('Simulation paths must be a positive whole number.');
  if (paths > 10000) { paths = 10000; warnings.push('Simulation count capped at 10,000 paths.'); }
  const tests: Record<QuantStep, RegExp> = {
    backtest: /\b(backtest|breakout|atr|strategy test)\b/,
    optimize: /\b(optimiz\w*|surface|heatmap|parameter grid)\b/,
    portfolio: /\b(portfolio|sleeves?|strategies|combine)\b/,
    montecarlo: /\b(monte\s*carlo|paths?|bootstrap)\b/,
    ftmo: /\b(ftmo|challenge|pass)\b/,
    deploy: /\b(deploy|ea|mt5|mt4|ctrader|cbot|expert advisor)\b/
  };
  const steps = QUANT_STEPS.filter(step => tests[step].test(value));
  if (!steps.length) { steps.push('backtest'); warnings.push('No workflow step was recognized; running a backtest.'); }
  return { symbol: matches[0]?.symbol || defaults.symbol || 'EURUSD', timeframe,
    dataType: timeframe === 'tick' ? 'tick' : defaults.dataType === 'close' && timeframe === 'D1' ? 'close' : 'ohlc',
    years, steps, paths, warnings };
}

export const keywordParser: CommandParser = { parse: async (text, defaults) => parseAsk(text, defaults) };

/** Inject an authenticated server parser only when the operator explicitly enables it.
 * Never include an LLM credential in the browser bundle. */
export function createCommandParser(options: { enabled?: boolean; apiKeyConfigured?: boolean; serverParser?: CommandParser } = {}): CommandParser {
  if (!options.enabled) return keywordParser;
  if (!options.apiKeyConfigured || !options.serverParser) throw new Error('The optional LLM parser needs a server key and a configured parser adapter.');
  return options.serverParser;
}
