// Provider widgets do not expose their audio samples: their waveform is decorative.
// Native same-origin audio uses an analyser when Web Audio is available.
export function waveformMarkup(){return `<div class="personal-listening-wave" role="img" aria-label="Animated waveform display"><svg viewBox="0 0 640 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="private-wave-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="640" y2="0"><stop offset="0" stop-color="var(--listening-color-a)"/><stop offset="0.2" stop-color="var(--listening-color-a)"/><stop offset="0.8" stop-color="var(--listening-color-b)"/><stop offset="1" stop-color="var(--listening-color-b)"/></linearGradient></defs><g fill="url(#private-wave-gradient)">${Array.from({length:80},(_,i)=>{const h=8+(i*37%59);return `<rect x="${i*8+2}" y="${38-h/2}" width="3" height="${h}" rx="1.5"/>`;}).join('')}</g></svg></div>`;}
export function animateWaveform(node,audio){
  const bars=[...node.querySelectorAll('rect')];let frame=null,last=0,context=null,analyser=null,samples=null,closed=false;
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)');
  try{
    const sameOrigin=audio&&new URL(audio.src,location.href).origin===location.origin;
    const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(sameOrigin&&AudioContext){context=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=256;samples=new Uint8Array(analyser.frequencyBinCount);const source=context.createMediaElementSource(audio);source.connect(analyser);analyser.connect(context.destination);context.resume().catch(()=>{});node.setAttribute('aria-label','Native audio waveform visualizer');}
    else node.setAttribute('aria-label','Ambient waveform animation; provider audio samples are unavailable');
  }catch{analyser=null;context?.close().catch(()=>{});context=null;}
  function tick(now){
    frame=null;if(closed||document.hidden||reduced?.matches)return;
    if(now-last>=1000/24){last=now;analyser?.getByteTimeDomainData(samples);
      bars.forEach((bar,i)=>{const t=now/1000;const height=analyser?Math.max(3,Math.abs(samples[Math.floor(i*samples.length/bars.length)]-128)*.55):
        5+58*Math.min(1,Math.abs(Math.sin(i*1.731+t*(.4+i%7*.11))*Math.cos(i*.419-t*.73))*.85+Math.abs(Math.sin(i*2.17+t*1.21))*.15);
        bar.setAttribute('height',String(height));bar.setAttribute('y',String(38-height/2));});
    }
    frame=requestAnimationFrame(tick);
  }
  function sync(){if(frame!==null)cancelAnimationFrame(frame);frame=null;if(!closed&&!document.hidden&&!reduced?.matches&&typeof requestAnimationFrame==='function')frame=requestAnimationFrame(tick);}
  document.addEventListener('visibilitychange',sync);reduced?.addEventListener?.('change',sync);sync();
  return ()=>{closed=true;if(frame!==null)cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',sync);reduced?.removeEventListener?.('change',sync);context?.close().catch(()=>{});};
}
