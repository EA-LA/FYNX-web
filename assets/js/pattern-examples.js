(function(){
 const examples=[
 {path:'40,240 100,140 155,235 230,65 310,235 380,145 450,235 510,270 565,235 640,315',lines:[[125,235,580,235]],label:'Neckline',tip:'A close below the neckline is the example confirmation. A return above it can invalidate the breakdown.'},
 {path:'40,100 100,230 155,135 230,305 310,135 380,235 450,135 510,95 565,135 640,50',lines:[[125,135,580,135]],label:'Neckline',tip:'A close above the neckline is the example confirmation. A failed breakout back below it weakens the setup.'},
 {path:'40,260 120,90 190,240 270,95 345,240 415,285 475,240 580,325',lines:[[150,240,590,240],[90,92,305,92]],label:'Neckline / resistance',tip:'Two peaks alone do not confirm a reversal. This example confirms below the intervening low.'},
 {path:'40,80 120,270 190,120 270,265 345,120 415,75 475,120 580,40',lines:[[150,120,590,120],[90,268,305,268]],label:'Neckline / support',tip:'The example confirms above the peak between the two lows. Price can still return to the range.'},
 {path:'45,285 110,100 180,250 245,100 305,215 370,100 430,175 485,100 550,130 635,50',lines:[[100,100,580,100],[45,285,550,135]],label:'Resistance / rising support',tip:'Rising lows meet flat resistance. The illustrated upside break needs confirmation; the pattern can also break down.'},
 {path:'45,75 110,260 180,110 245,260 305,145 370,260 430,190 485,260 550,225 635,325',lines:[[100,260,580,260],[45,75,550,225]],label:'Support / falling resistance',tip:'Lower highs meet flat support. The illustrated downside break needs confirmation; the pattern can also break up.'},
 {path:'40,315 145,75 205,145 265,105 325,180 385,140 445,205 505,155 620,50',lines:[[145,75,510,155],[205,145,445,205]],label:'Flag channel',tip:'This bullish flag example follows an impulse and a smaller pullback. A bearish version is mirrored. A pennant instead has converging boundaries.'},
 {path:'40,300 110,175 180,265 245,140 305,215 370,108 430,155 495,78 540,120 585,200 650,260',lines:[[110,175,560,45],[40,300,550,110]],label:'Converging trend lines',tip:'This rising wedge example breaks lower. Wedges can rise or fall; wait for the actual boundary break rather than assuming direction.'},
 {path:'40,245 110,100 185,260 260,105 335,260 410,100 485,255 560,105 640,55',lines:[[70,100,590,100],[70,260,590,260]],label:'Resistance / support',tip:'The range is bounded by repeated highs and lows. This example shows an upside break, but false breaks can return inside the box.'}
 ];
 const buttons=[...document.querySelectorAll('button.pattern')],out=document.getElementById('patternExample');
 if (!out || !buttons.length) return;
 function draw(host,index,heading){
 const e=examples[index],name=buttons[index].querySelector('h3').textContent;
 const label=name.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
 host.textContent='';const title=document.createElement(heading);title.textContent=name;host.append(title);
 host.insertAdjacentHTML('beforeend',`<svg viewBox="0 0 700 380" role="img" aria-label="${label} illustrative price line and structure"><path d="M30 30V345H670" fill="none" stroke="currentColor" opacity=".15"/>${e.lines.map(l=>`<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" stroke="#b58b47" stroke-width="2" stroke-dasharray="7 6"/>`).join('')}<polyline points="${e.path}" fill="none" stroke="#4a9274" stroke-width="4" stroke-linejoin="round"/><text x="40" y="365">Time → · Illustrative prices</text><text x="40" y="25">${e.label}</text></svg>`);
 const text=document.createElement('p');text.textContent=e.tip+(heading==='h2'?' Educational illustration, not a live signal or a guaranteed outcome.':'');host.append(text);
 }
 function show(index,focus){
 if (!examples[index] || !buttons[index]) return;
 buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
 draw(out,index,'h2');
 if(focus){
  // Move focus even when an older WebView cannot handle scroll options.
  try { out.focus({preventScroll:true}); } catch (_) { out.focus(); }
  if(typeof out.scrollIntoView==='function'){
   const reduce=typeof window.matchMedia!=='function'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   try { out.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'}); }
   catch (_) { out.scrollIntoView(true); }
  }
 }
 }
 buttons.forEach((b,i)=>b.addEventListener('click',()=>show(i,true)));show(0,false);

 const compare=document.getElementById('patternCompare');
 if(!compare || Math.min(buttons.length,examples.length)<2)return;
 const first=document.getElementById('patternCompareFirst'),second=document.getElementById('patternCompareSecond');
 const status=document.getElementById('patternCompareStatus'),grid=document.getElementById('patternCompareGrid');
 for(const select of [first,second])buttons.slice(0,examples.length).forEach((button,index)=>{
  const option=document.createElement('option');
  option.value=String(index);option.textContent=button.querySelector('h3').textContent;select.append(option);
 });
 first.value=first.options.length>5?'4':'0';second.value=second.options.length>5?'5':'1';
 function renderComparison(){
  const picks=[first,second].map(select=>/^\d+$/.test(select.value)?Number(select.value):-1);
  grid.textContent='';
  if(picks.some(index=>!examples[index] || !buttons[index]) || picks[0]===picks[1]){
   status.textContent='Choose two different patterns to compare.';return;
  }
  for(const index of picks){
   const card=document.createElement('article');card.className='pattern-compare-card';
   draw(card,index,'h3');grid.append(card);
  }
  status.textContent=`Comparing ${first.selectedOptions[0].textContent} and ${second.selectedOptions[0].textContent}.`;
 }
 for(const select of [first,second])select.addEventListener('change',renderComparison);
 renderComparison();
 compare.hidden=false;
 document.getElementById('patternCompareLink').hidden=false;
})();
