import {read,write} from './storage.js';
const $=s=>document.querySelector(s);
export const PALETTES=[
  {id:'cyan-violet',name:'Cyan to violet',colors:['#04D9FF','#B066FF']},
  {id:'neon-blue',name:'Neon yellow to electric blue',colors:['#EFFF00','#246BFF']},
  {id:'teal-coral',name:'Teal to coral',colors:['#00F5C4','#FF6F61']},
  {id:'magenta-amber',name:'Magenta to amber',colors:['#FF38D1','#FFBE38']},
  {id:'violet-rose',name:'Violet to rose',colors:['#9757FF','#FF609C']}
].map(p=>({...p,rgb:p.colors.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)))}));
for(const p of PALETTES)p.ramp=Array.from({length:256},(_,i)=>p.rgb[0].map((v,k)=>Math.round(v+(p.rgb[1][k]-v)*i/255)).join(','));
let palette=PALETTES.find(p=>p.id===read('hero-palette',null))||PALETTES[0];
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-hero-palette]');if(!button)return;
  palette=PALETTES.find(p=>p.id===button.dataset.heroPalette)||PALETTES[0];write('hero-palette',palette.id);
  document.querySelectorAll('[data-hero-palette]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.heroPalette===palette.id)));
  document.dispatchEvent(new Event('hero-palette-change'));
});
let heroFrame=null,heroObserver=null,heroCleanup=null;
export function paletteMarkup(){return `<div class="hero-palettes" role="group" aria-label="Hero color gradient">${PALETTES.map(p=>`<button data-hero-palette="${p.id}" title="${p.name}" aria-label="${p.name}" aria-pressed="${palette.id===p.id}" style="--swatch:linear-gradient(100deg,${p.colors[0]},${p.colors[1]})"></button>`).join('')}</div>`}
export function heroMarkup(){return `<section class="ascii-hero" aria-label="DROP:PORTAL signal visual"><canvas id="ascii-hero-canvas" role="img" aria-label="ASCII texture with evolving rotational flow"></canvas><div class="ascii-hero-chrome" aria-hidden="true"><span>LIVE SIGNAL / 001</span><i></i><span>DROP:PORTAL</span></div><noscript><img src="/ascii-portal.png" alt="Cyan ASCII portal graphic"></noscript></section>`}
export function stopHero(){if(heroFrame!==null)cancelAnimationFrame(heroFrame);heroFrame=null;heroObserver?.disconnect();heroObserver=null;heroCleanup?.();heroCleanup=null}
export function initHero(){
  stopHero();const canvas=$('#ascii-hero-canvas');if(!canvas)return;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0,ratio=1,visible=true,last=0,elapsed=0;
  // Preserve the full-width ASCII field; rotate its sampled contours, not the canvas.
  const lobes=[[-.86,.15,.39,.31,0],[-.39,-.48,.48,.23,2.1],[.07,.42,.42,.28,4.7],[.48,-.31,.47,.19,1.3],[.94,.36,.38,.26,3.4]];
  function draw(t){
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#030607';ctx.fillRect(0,0,width,height);
    const cell=6,row=8,cols=Math.ceil(width/cell),rows=Math.ceil(height/row);
    ctx.font='8px monospace';ctx.textBaseline='middle';ctx.textAlign='center';
    const shapes=lobes.map(([x,y,r,s,p])=>({x:x+Math.sin(t*s+p)*.035,y:y+Math.cos(t*s*.71+p)*.09,r:r*(1+.09*Math.sin(t*s*.63+p)),p,s}));
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const u=(i*cell/width*2-1)*1.2,v=(j*row/height*2-1)*.7;
      // Gentle vortex advection with differential rotation across the field.
      const radius=Math.hypot(u,v),turn=t*(.085+.035*Math.exp(-radius*radius));
      const x=u*Math.cos(turn)+v*Math.sin(turn),y=-u*Math.sin(turn)+v*Math.cos(turn);
      let field=0;
      for(const l of shapes){const dx=x-l.x,dy=y-l.y;const angle=Math.atan2(dy,dx);const r=l.r*(1+.10*Math.sin(angle*3-t*l.s+l.p)+.05*Math.cos(angle*5-t*l.s*.6));field+=Math.exp(-(dx*dx+dy*dy)/(r*r)*2.5);}
      field+=.035*Math.sin(x*8+y*5+t*.17)*Math.cos(y*7-x*3-t*.13);
      const band=field*8,edge=Math.pow((Math.cos(band*Math.PI*2)+1)/2,6);
      const mask=Math.min(1,Math.max(0,(field-.07)*9));
      if(mask<.02)continue;
      const phase=Math.sin(x*5-y*4+t*.29),density=Math.min(1,field*.6);
      let char=edge>.65?'=':edge>.25?'+':density>.52?'#':density>.25?':':'.';
      if(edge<.25&&phase>.45)char='|';
      const a=mask*(.19+edge*.62+density*.15);
      const blend=Math.max(0,Math.min(1,.5+x*.27+y*.23));
      const rgb=palette.ramp[Math.round(blend*255)];
      ctx.fillStyle=`rgba(${rgb},${Math.min(.95,a)})`;ctx.fillText(char,i*cell+3,j*row+4);
    }
  }
  function size(){const box=canvas.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);draw(elapsed);}
  function tick(now){heroFrame=null;if(!visible||document.hidden||reduced.matches)return;if(!last)last=now;if(now-last>=1000/24){elapsed+=Math.min(now-last,80)/1000;last=now;draw(elapsed);}heroFrame=requestAnimationFrame(tick);}
  function sync(){if(heroFrame!==null)cancelAnimationFrame(heroFrame);heroFrame=null;last=0;if(visible&&!document.hidden&&!reduced.matches)heroFrame=requestAnimationFrame(tick);else draw(elapsed);}
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()});intersection.observe(canvas);
  heroObserver=new ResizeObserver(size);heroObserver.observe(canvas);size();
  document.addEventListener('hero-palette-change',sync);
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
  heroCleanup=()=>{intersection.disconnect();document.removeEventListener('hero-palette-change',sync);document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync)};sync();
}
