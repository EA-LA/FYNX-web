import * as quant from './index';
declare const self: any;
self.onmessage = ({data}: any) => {
  const {id, action, payload = {}} = data;
  const progress = (value: number) => self.postMessage({id,progress:value});
  try {
    let result;
    if(action === 'backtest') result = quant.backtest(payload.bars,payload.params);
    else if(action === 'optimize') result = quant.optimize(payload.bars,payload.params,payload.options,progress);
    else if(action === 'portfolio') result = quant.portfolio(payload.sleeves,payload.options);
    else if(action === 'montecarlo') result = quant.monteCarlo(payload.returns,payload.options,progress);
    else if(action === 'ftmo') result = quant.ftmo(payload.returns,payload.options,progress);
    else if(action === 'eventstudy') result = quant.eventStudy(payload.bars,payload.events,payload.options);
    else throw new Error('Unknown calculation');
    self.postMessage({id,result});
  } catch(error) { self.postMessage({id,error:error instanceof Error ? error.message : 'Calculation failed'}); }
};
