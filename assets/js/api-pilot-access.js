// Narrow first-party pilot access; never grants owner or administrator privileges.
export function canUseApiPilot(path,claims={}){
 return path==='/tools/risk-reward.html'&&claims.apiPilot===true;
}
