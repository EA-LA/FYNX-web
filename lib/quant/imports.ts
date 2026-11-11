export interface ImportedReturn { date: string; return: number; traded?: boolean }
export interface ImportedStrategy {
  name: string;
  returns: ImportedReturn[];
  source: 'csv-daily-returns' | 'csv-realized-trades';
  warnings: string[];
}
const MAX_ROWS = 100000;
function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}
function date(value: string, line: number): string {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value.trim());
  const day = match?.[1];
  if (!day || !Number.isFinite(Date.parse(value)) || new Date(day + 'T00:00:00Z').toISOString().slice(0,10) !== day) throw new Error(`Row ${line}: use a valid ISO date (YYYY-MM-DD).`);
  return day;
}
function numeric(value: string, line: number, key: string): number {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error(`Row ${line}: ${key} must be a number without currency signs or percent symbols.`);
  return finite(Number(value), `Row ${line}: ${key}`);
}
/** RFC4180-style quoting, commas and line breaks; deliberately rejects malformed rows. */
function parseCSV(csv: string): string[][] {
  if (typeof csv !== 'string' || !csv.trim()) throw new Error('The CSV is empty.');
  if (csv.length > 10 * 1024 * 1024) throw new Error('CSV files must be no larger than 10 MB.');
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false, closed = false;
  const pushCell = () => { row.push(value.trim()); value=''; closed=false; };
  const pushRow = () => { pushCell(); if (row.some(Boolean)) rows.push(row); row=[]; if(rows.length>MAX_ROWS+1) throw new Error('CSV exceeds 100,000 rows.'); };
  csv = csv.replace(/^\uFEFF/, '');
  for(let i=0;i<csv.length;i++) {
    const c=csv[i];
    if(quoted) { if(c==='"' && csv[i+1]==='"') {value+='"';i++;} else if(c==='"') {quoted=false;closed=true;} else value+=c; }
    else if(c==='"') { if(value || closed) throw new Error('Malformed CSV quoting.'); quoted=true; }
    else if(c===',') pushCell();
    else if(c==='\r' || c==='\n') {if(c==='\r' && csv[i+1]==='\n')i++;pushRow();}
    else if(closed && c.trim()) throw new Error('Unexpected text after a quoted CSV field.');
    else if(!closed) value+=c;
  }
  if(quoted)throw new Error('Unclosed quote in CSV.');
  if(value || row.length || closed)pushRow();
  return rows;
}
export function importReturnsCSV(csv: string, options: { initialEquity?: number; name?: string } = {}): ImportedStrategy {
  const rows=parseCSV(csv), headers=rows.shift()?.map(x=>x.toLowerCase());
  if(!headers || !rows.length)throw new Error('CSV needs a header and at least one data row.');
  if(new Set(headers).size!==headers.length)throw new Error('CSV contains duplicate column names.');
  const daily=['date','return_pct'].every(h=>headers.includes(h));
  const trades=['entry_date','exit_date','pnl'].every(h=>headers.includes(h));
  if(daily===trades)throw new Error('Use either date,return_pct or entry_date,exit_date,pnl columns.');
  const points: ImportedReturn[]=[]; const seen=new Set<string>();
  const cash=new Map<string,number>(), entryDays=new Set<string>(); let earliest='',latest='';
  for(let i=0;i<rows.length;i++) {
    const row=rows[i],line=i+2;
    if(row.length!==headers.length)throw new Error(`Row ${line}: expected ${headers.length} columns, received ${row.length}.`);
    const get=(key:string)=>row[headers.indexOf(key)];
    if(daily) {
      const d=date(get('date'),line),r=numeric(get('return_pct'),line,'return_pct')/100;
      if(r< -1)throw new Error(`Row ${line}: a return cannot be below -100%.`);
      if(seen.has(d))throw new Error(`Row ${line}: duplicate daily return for ${d}.`);
      seen.add(d);points.push({date:d,return:r,traded:r!==0});
    } else {
      const entry=date(get('entry_date'),line),exit=date(get('exit_date'),line),pnl=numeric(get('pnl'),line,'pnl');
      if(exit<entry)throw new Error(`Row ${line}: exit date is before entry date.`);
      cash.set(exit,(cash.get(exit)||0)+pnl);entryDays.add(entry);
      earliest=!earliest||entry<earliest?entry:earliest;latest=!latest||exit>latest?exit:latest;
    }
  }
  if(trades) {
    let balance=finite(options.initialEquity,'Initial equity');
    if(balance<=0)throw new Error('Enter positive initial equity to convert cash P&L into returns.');
    const count=(Date.parse(latest)-Date.parse(earliest))/86400000+1;
    if(count>MAX_ROWS)throw new Error('Trade dates span more than 100,000 days.');
    for(let t=Date.parse(earliest);t<=Date.parse(latest);t+=86400000) {
      const d=new Date(t).toISOString().slice(0,10),pnl=cash.get(d)||0;
      if(balance<=0)throw new Error('The imported trade account becomes insolvent before the last date.');
      const r=pnl/balance;
      if(r< -1)throw new Error(`Loss on ${d} exceeds the remaining equity.`);
      points.push({date:d,return:r,traded:entryDays.has(d)});balance+=pnl;
    }
  }
  points.sort((a,b)=>a.date.localeCompare(b.date));
  return {name:(options.name||'Imported strategy').slice(0,120),returns:points,source:daily?'csv-daily-returns':'csv-realized-trades',warnings:trades?['Trade-list returns use calendar days and recognize P&L on exit dates only; trading-day flags use entry dates. Open-position mark-to-market and intraday drawdowns are unavailable; challenge estimates cannot certify compliance.']:['Returns are user supplied. Nonzero-return days are used as a trading-day proxy unless a verified trade history is available.']};
}

export interface PortableStrategy {
  id?: string; name: string; symbol: string; timeframe: string;
  params?: Record<string, number | string>; returns?: ImportedReturn[];
}
export function validateStrategy(input: unknown): PortableStrategy {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Each strategy must be an object.');
  const x=input as Record<string,unknown>;
  if(typeof x.name!=='string'||!x.name.trim()||x.name.length>120)throw new Error('A strategy needs a name of 1–120 characters.');
  if(typeof x.symbol!=='string'||!/^([A-Z0-9]{3,12}|[A-Z]{3}\/[A-Z]{3})$/.test(x.symbol))throw new Error('Invalid strategy symbol.');
  if(typeof x.timeframe!=='string'||!['M1','M5','H1','H4','D1','tick'].includes(x.timeframe))throw new Error('Invalid strategy timeframe.');
  const out:PortableStrategy={name:x.name.trim(),symbol:x.symbol,timeframe:x.timeframe};
  if(typeof x.id==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x.id))out.id=x.id;
  if(x.params!==undefined) {
    if(!x.params||typeof x.params!=='object'||Array.isArray(x.params))throw new Error('Strategy parameters must be an object.');
    const allowed=['lookback','atrPeriod','entryK','stopS','targetTP','maxHold','costPips','riskPct','pipSize','spreadPips','slippagePips','mode','strategy','newsWindowMinutes','initialEquity','eventType','meanLookback','meanEntryZ'];
    out.params={};
    for(const [key,v] of Object.entries(x.params)) {
      if(!allowed.includes(key))throw new Error(`Unsupported strategy parameter: ${key}`);
      if(typeof v==='number')out.params[key]=finite(v,key);
      else if(key==='eventType'&&typeof v==='string'&&/^[A-Za-z0-9 _-]{0,80}$/.test(v))out.params[key]=v;
      else if((key==='mode'&&['close','ohlc','tick'].includes(String(v)))||(key==='strategy'&&['breakout','news','mean-reversion'].includes(String(v))))out.params[key]=String(v);
      else throw new Error(`Invalid strategy parameter: ${key}`);
    }
  }
  if(x.returns!==undefined) {
    if(!Array.isArray(x.returns)||!x.returns.length||x.returns.length>MAX_ROWS)throw new Error('Imported strategy returns need 1–100,000 rows.');
    const seen=new Set<string>();
    out.returns=x.returns.map((p:any,i)=>{
      if(!p||typeof p!=='object')throw new Error('Invalid return row.');
      const d=date(String(p.date),i+1),r=finite(p.return,`Return ${i+1}`);
      if(r< -1 || seen.has(d))throw new Error('Duplicate date or return below -100%.');seen.add(d);
      if(p.traded!==undefined&&typeof p.traded!=='boolean')throw new Error('Trading-day flags must be boolean.');
      return {date:d,return:r,traded:p.traded??r!==0};
    }).sort((a,b)=>a.date.localeCompare(b.date));
  }
  if(!out.params&&!out.returns)throw new Error('A strategy needs parameters or an imported return series.');
  return out;
}
export function importStrategiesJSON(json:string):PortableStrategy[] {
  if(typeof json!=='string'||json.length>10*1024*1024)throw new Error('Strategy JSON must be below 10 MB.');
  let value:any;try{value=JSON.parse(json);}catch{throw new Error('Invalid strategy JSON.');}
  const rows=Array.isArray(value)?value:value?.version===1?value.strategies:null;
  if(!Array.isArray(rows)||rows.length>100)throw new Error('Expected up to 100 strategies in a version 1 export.');
  return rows.map(validateStrategy);
}
export function exportStrategiesJSON(strategies:PortableStrategy[]):string {
  return JSON.stringify({version:1,strategies:strategies.map(validateStrategy)},null,2);
}
