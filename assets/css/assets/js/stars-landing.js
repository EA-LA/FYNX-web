const canvas = document.getElementById("stars");
const ctx = canvas.getContext("2d");
let w, h, stars;

function resize(){
  w = canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
  h = canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
  stars = Array.from({length: Math.floor((w*h)/180000)}, () => ({
    x: Math.random()*w,
    y: Math.random()*h,
    r: (Math.random()*1.4 + 0.2) * devicePixelRatio,
    v: (Math.random()*0.35 + 0.08) * devicePixelRatio
  }));
}
window.addEventListener("resize", resize, {passive:true});
resize();

function tick(){
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = "rgba(233,237,247,.9)";
  for(const s of stars){
    s.y += s.v;
    if(s.y > h){ s.y = -10; s.x = Math.random()*w; }
    ctx.globalAlpha = 0.35 + Math.random()*0.45;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fill();
  }
  requestAnimationFrame(tick);
}
tick();
