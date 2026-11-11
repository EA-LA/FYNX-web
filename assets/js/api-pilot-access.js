// Only these calculator routes are part of the first-party pilot.
const calculatorPaths=new Set(['/tools/risk-reward.html','/tools/pip.html','/tools/margin.html','/tools/breakeven.html','/tools/atr-stop.html','/tools/position-size.html']);
export function canUseApiPilot(path,claims={}){
 return calculatorPaths.has(path)&&claims.apiPilot===true;
}
