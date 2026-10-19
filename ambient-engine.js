/* Procedural Sci-Fi Ambient Engine. No audio files or third-party dependencies. */
export function initAmbientEngine(){
 const $=id=>document.getElementById(id),toggle=$('ambientToggle'),volume=$('ambientVolume'),beeps=$('ambientBeeps'),status=$('ambientStatus');
 if(!toggle||!volume||!status)return;
 let ctx=null,master=null,droneGain=null,noiseGain=null,filter=null,oscillators=[],timer=null,active=false,preset='bridge',noiseBuffer=null;
 const presets={bridge:{drone:43,noise:.22,filter:850},server:{drone:58,noise:.12,filter:420},radio:{drone:35,noise:.36,filter:1500}};
 function noise(){
  if(noiseBuffer)return noiseBuffer;const size=2*ctx.sampleRate;noiseBuffer=ctx.createBuffer(1,size,ctx.sampleRate);const data=noiseBuffer.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for(let i=0;i<size;i++){const w=Math.random()*2-1;b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*w+w*.153852;b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;data[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926;}
  return noiseBuffer;
 }
 function setVolume(){if(master&&ctx)master.gain.setTargetAtTime(Number(volume.value)/100*.42,ctx.currentTime,.15);}
 function build(){
  ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
  const p=presets[preset];droneGain=ctx.createGain();droneGain.gain.value=.15;droneGain.connect(master);
  [1,1.503,2.01].forEach((r,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=i===1?'triangle':'sine';o.frequency.value=p.drone*r;g.gain.value=[.52,.17,.08][i];o.connect(g);g.connect(droneGain);o.start();oscillators.push(o);});
  filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=p.filter;filter.Q.value=.5;
  noiseGain=ctx.createGain();noiseGain.gain.value=p.noise;const src=ctx.createBufferSource();src.buffer=noise();src.loop=true;src.connect(filter);filter.connect(noiseGain);noiseGain.connect(master);src.start();
  setVolume();master.gain.setTargetAtTime(Number(volume.value)/100*.42,ctx.currentTime,.8);
 }
 function beep(){
  if(!active||!ctx||ctx.state!=='running'||!beeps.checked)return;
  const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=[620,740,880,510][Math.floor(Math.random()*4)];
  g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.035,ctx.currentTime+.025);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.23);o.connect(g);g.connect(master);o.start();o.stop(ctx.currentTime+.25);
 }
 function schedule(){clearTimeout(timer);if(active)timer=setTimeout(()=>{beep();schedule();},18000+Math.random()*42000);}
 function applyPreset(){
  if(!ctx||!active)return;const p=presets[preset];oscillators.forEach((o,i)=>o.frequency.setTargetAtTime(p.drone*[1,1.503,2.01][i],ctx.currentTime,.8));
  if(noiseGain)noiseGain.gain.setTargetAtTime(p.noise,ctx.currentTime,.8);if(filter)filter.frequency.setTargetAtTime(p.filter,ctx.currentTime,.8);
 }
 async function start(){
  try{if(!ctx)build();await ctx.resume();active=true;toggle.textContent='■ Выключить фон';toggle.setAttribute('aria-pressed','true');status.textContent='АКТИВЕН';status.className='status ok';schedule();}
  catch(e){status.textContent='АУДИО НЕДОСТУПНО';status.className='status error';console.error('[ambient engine]',e);}
 }
 async function stop(){
  active=false;clearTimeout(timer);timer=null;if(ctx){master.gain.setTargetAtTime(0,ctx.currentTime,.12);await new Promise(resolve=>setTimeout(resolve,180));await ctx.suspend();}
  toggle.textContent='▶ Включить фон';toggle.setAttribute('aria-pressed','false');status.textContent='ВЫКЛЮЧЕН';status.className='status';
 }
 toggle.addEventListener('click',()=>active?stop():start());volume.addEventListener('input',setVolume);
 document.querySelectorAll('[data-ambient-preset]').forEach(b=>b.addEventListener('click',()=>{preset=b.dataset.ambientPreset;document.querySelectorAll('[data-ambient-preset]').forEach(x=>x.classList.toggle('active',x===b));applyPreset();}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop();});
 window.addEventListener('pagehide',()=>{active=false;clearTimeout(timer);if(ctx)ctx.close().catch(()=>{});},{once:true});
}
