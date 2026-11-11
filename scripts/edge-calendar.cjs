'use strict';
const {ingest}=require('../backend/quant/ingest.cjs');
const {TradingEconomicsCalendar}=require('../backend/quant/providers.cjs');
const {argumentsFor}=require('./quant-history.cjs');
async function main(){const args=argumentsFor(process.argv.slice(2));if(args.help){console.log('Import entitled medium/high calendar history: node --env-file=.env scripts/edge-calendar.cjs --from 2016-11-03 --to 2026-11-03 [--max-gb 0.25] [--max-chunks 12]');return;}if(!args.from||!args.to)throw new Error('Explicit --from and --to are required.');const maxGB=Number(args['max-gb']||.25),maxChunks=Number(args['max-chunks']||100000);if(!(maxGB>0&&maxGB<=10)||!Number.isInteger(maxChunks)||maxChunks<1)throw new Error('Choose positive bounded import limits.');const receipt=await ingest({from:args.from,to:args.to,calendar:true,impact:'medium-high',provider:new TradingEconomicsCalendar(),maxBytes:maxGB*1024**3,maxChunks,progress:r=>console.log(JSON.stringify({through:r.coveredThrough,chunks:r.chunksDownloaded,records:r.recordsDownloaded}))});console.log(JSON.stringify(receipt,null,2));if(!receipt.complete)process.exitCode=2;}
if(require.main===module)main().catch(e=>{console.error(e.code?e.message:'Calendar importer could not start: '+e.message);process.exitCode=1;});
module.exports={main};
