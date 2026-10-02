import {read,write} from './storage.js';
export function clampPlayerPosition(position,viewport,box){
  const maxX=Math.max(8,viewport.width-box.width-8),maxY=Math.max(8,viewport.height-box.height-8);
  return {x:Math.max(8,Math.min(maxX,Number.isFinite(position?.x)?position.x:maxX/2)),y:Math.max(8,Math.min(maxY,Number.isFinite(position?.y)?position.y:maxY))};
}
const desktop=()=>typeof matchMedia==='function'&&matchMedia('(min-width: 900px) and (pointer: fine)').matches;
export function setupPlayerPosition(node,owner){
  let position=read('private-player-position:'+owner,null),drag=null;
  const bounds=()=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height});
  const viewport=()=>({width:window.innerWidth,height:window.innerHeight});
  function apply(){
    if(!desktop()||!position){node.classList.remove('is-floating');node.style.removeProperty('left');node.style.removeProperty('top');return;}
    position=clampPlayerPosition(position,viewport(),bounds());node.classList.add('is-floating');node.style.left=position.x+'px';node.style.top=position.y+'px';
  }
  function down(e){
    if(!desktop()||e.button!==0||!e.target.closest('[data-listening-drag]')||e.target.closest('button,input,a'))return;
    const rect=node.getBoundingClientRect();position={x:rect.left,y:rect.top};drag={id:e.pointerId,x:e.clientX,y:e.clientY,origin:{...position}};
    node.setPointerCapture?.(e.pointerId);node.classList.add('is-dragging');e.preventDefault();
  }
  function move(e){if(!drag||e.pointerId!==drag.id)return;position={x:drag.origin.x+e.clientX-drag.x,y:drag.origin.y+e.clientY-drag.y};apply();}
  function finish(e){if(!drag||e.pointerId!==drag.id)return;drag=null;node.classList.remove('is-dragging');write('private-player-position:'+owner,position);}
  function reset(){position=null;write('private-player-position:'+owner,null);apply();}
  function key(e){if(!desktop()||!e.target.matches('[data-listening-drag]'))return;const dirs={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(!dirs[e.key])return;e.preventDefault();const rect=node.getBoundingClientRect();position={x:rect.left+dirs[e.key][0],y:rect.top+dirs[e.key][1]};apply();write('private-player-position:'+owner,position);}
  node.addEventListener('listening-layout-change',apply);node.addEventListener('pointerdown',down);node.addEventListener('pointermove',move);node.addEventListener('pointerup',finish);node.addEventListener('pointercancel',finish);node.addEventListener('keydown',key);window.addEventListener('resize',apply);
  node.querySelector('[data-listening-reset-position]')?.addEventListener('click',reset);
  apply();
  return ()=>{node.removeEventListener('listening-layout-change',apply);node.removeEventListener('pointerdown',down);node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',finish);node.removeEventListener('pointercancel',finish);node.removeEventListener('keydown',key);window.removeEventListener('resize',apply);node.querySelector('[data-listening-reset-position]')?.removeEventListener('click',reset);};
}
