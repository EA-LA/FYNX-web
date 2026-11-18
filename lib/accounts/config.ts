import ftmo2 from '../../config/prop-firms/ftmo-2-step.json';
import ftmo1 from '../../config/prop-firms/ftmo-1-step.json';
import ftmoLegacy from '../../config/prop-firms/ftmo-1-step-legacy.json';
import fundednext from '../../config/prop-firms/fundednext.json';
import the5ers from '../../config/prop-firms/the5ers.json';
import fundingpips from '../../config/prop-firms/funding-pips.json';
import alpha from '../../config/prop-firms/alpha-capital.json';
import e8 from '../../config/prop-firms/e8-markets.json';
import futures from '../../config/prop-firms/futures-prop.json';
import other from '../../config/prop-firms/other.json';
import type { RuleVersion } from './types';
const files = [ftmo2, ftmo1, ftmoLegacy, fundednext, the5ers, fundingpips, alpha, e8, futures, other];
export const RULES: RuleVersion[] = files as RuleVersion[];
export const PROP_FIRMS = [...new Map(files.map(file => [file.firmId, { id: file.firmId, name: file.firmName, platforms: file.platforms as string[], verified: file.verified }])).values()];
export const ACCOUNTS_CONFIG = { coachMinimumTrades: 20, liveMinimumTrades: 20, eventLookaheadMinutes: 30, earlyCloseFraction: .5, lowFitThreshold: 45, riskToleranceFraction: .01, staleAfterMs: 180000, alerts: [.5, .75, .9] } as const;
export function getRule(id: string): RuleVersion | null { const legacy: Record<string, string> = { '2-step': ftmo2.id, '1-step': ftmo1.id, '1-step-legacy': ftmoLegacy.id }; return RULES.find(rule => rule.id === (legacy[id] || id)) || null; }
