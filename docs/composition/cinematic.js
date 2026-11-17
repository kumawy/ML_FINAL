/* The interior uses ordinary native navigation. Only the requested final
 * exterior transition and closing movie have additional choreography.
 * Native slideshow owns video playback; graphic timing reads media PTS. */
(function(){
  'use strict';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const exit=document.createElement('div');exit.className='cockpit-exit-layer';exit.setAttribute('aria-hidden','true');
  const exitView=document.createElement('div');exitView.className='cockpit-exit-view';exit.append(exitView);document.body.append(exit);
  let exitMove=null,exitTargets=[],lastTransition=null,phase='rest';
  function cloneState(source){
    const copy=source.cloneNode(true),srcCanvas=source.querySelectorAll('canvas'),dstCanvas=copy.querySelectorAll('canvas');
    srcCanvas.forEach((c,i)=>dstCanvas[i].getContext('2d').drawImage(c,0,0));
    const a=[source,...source.querySelectorAll('*')],b=[copy,...copy.querySelectorAll('*')];
    a.forEach((node,i)=>{if(node.id){const cs=getComputedStyle(node);if(cs.width!=='auto')b[i].style.width=cs.width;if(cs.height!=='auto')b[i].style.height=cs.height;b[i].removeAttribute('id');}for(const attr of ['data-scene-id','data-composition-id','data-anim','data-stage','autofocus'])b[i].removeAttribute(attr);});
    copy.inert=true;copy.style.opacity='1';copy.style.visibility='visible';copy.style.pointerEvents='none';return copy;
  }
  function clearExit(){
    if(exitMove){exitMove.kill();exitMove=null;}
    if(exitTargets.length)gsap.set(exitTargets,{clearProps:'opacity,transform'});
    exitTargets=[];exitView.replaceChildren();gsap.set(exit,{visibility:'hidden',opacity:1});gsap.set(exitView,{opacity:1});phase='rest';
  }
  function startExit(source){
    exitView.append(cloneState(source));gsap.set(exit,{visibility:'visible',opacity:1});gsap.set(exitView,{opacity:1});
    lastTransition={kind:'exterior-dip',from:source.dataset.sceneId,to:'conclusion'};phase='exterior-exit';
    exitMove=gsap.timeline({onComplete:clearExit});
    exitMove.to(exitView,{opacity:0,duration:.20,ease:'power1.in'},0)
      .to(exit,{opacity:0,duration:.24,ease:'power1.out'},.24);
  }
  window.addEventListener('pilot:willchange',event=>{
    clearExit();const d=event.detail;if(!d.changed||!d.live||reduced.matches||d.id!=='conclusion')return;
    const source=document.querySelector('[data-scene-id="'+d.previousId+'"]');
    if(source?.classList.contains('hud-scene'))startExit(source);
  });
  const film=document.getElementById('thanks-film'),white=document.querySelector('.thanks-whiteout'),type=window.FINALE_TYPE;
  const deckWidth = 1920;
  const passStart = Number(film.dataset.passStartFrame);
  const passEnd = Number(film.dataset.passEndFrame);
  const fps = Number(film.dataset.passFps);
  const rearStart = Number(film.dataset.rearStart);
  const rearStep = Number(film.dataset.rearStep);
  const lightEnd = Number(film.dataset.lightEnd);
  const rearClearance = 3;
  let closingLive = false;
  let mediaStarted = false;
  let finishedThanks = false;
  let whiteProgress = 0;
  let revealEdge = 0;
  let revealMediaTime = 0;
  let videoFrame = null;
  let closingRun = 0;
  let remoteRun = null;
  let remoteSequence = -1;

  function cancelFrame() {
    if (videoFrame !== null) film.cancelVideoFrameCallback(videoFrame);
    videoFrame = null;
  }

  function stopClosing() {
    cancelFrame();
    closingLive = false;
    mediaStarted = false;
    finishedThanks = false;
    whiteProgress = 0;
    revealEdge = 0;
    revealMediaTime = 0;
    remoteRun = null;
    remoteSequence = -1;
    type.reset();
  }

  function finishClosing() {
    cancelFrame();
    finishedThanks = true;
    whiteProgress = 1;
    revealEdge = deckWidth;
    gsap.set(white, {opacity: 1});
    type.rest();
  }

  function thanks(animate) {
    stopClosing();
    closingRun += 1;
    closingLive = animate;
    gsap.set(white, {opacity: animate ? 0 : 1});
    if (!animate) finishClosing();
  }

  function trackRear(time, exactFrame) {
    // The orthographic car moves linearly across the frame. Reveal the ink
    // on the pavement up to the rear wing of the frame actually displayed.
    const frame = exactFrame ? Math.round(time * fps) : Math.floor(time * fps + .0001);
    let edge = 0;
    if (frame >= passEnd) edge = deckWidth;
    else if (frame >= passStart) edge = rearStart + (frame - passStart) * rearStep - rearClearance;
    revealMediaTime = time;
    revealEdge = Math.min(deckWidth, Math.max(0, edge));
    type.trackTo(revealEdge);
  }

  function readClosing(time = film.currentTime, exactFrame = false) {
    if (PILOT_RUNTIME.currentId !== 'thanks' || !closingLive || finishedThanks) return;
    if (!mediaStarted && time < .16) mediaStarted = true;
    if (!mediaStarted) return;
    whiteProgress = Math.min(1, Math.max(0, time / lightEnd));
    trackRear(time, exactFrame);
    if (film.ended) finishClosing();
  }

  function scheduleFrame() {
    if (!film.requestVideoFrameCallback || videoFrame !== null || !closingLive || film.paused || finishedThanks) return;
    videoFrame = film.requestVideoFrameCallback((_, frame) => {
      videoFrame = null;
      readClosing(frame.mediaTime, true);
      scheduleFrame();
    });
  }

  film.addEventListener('play', () => {
    if (PILOT_RUNTIME.currentId === 'thanks' && closingLive && !film.ended) mediaStarted = true;
    scheduleFrame();
  });
  film.addEventListener('seeked', () => {
    if (PILOT_RUNTIME.currentId === 'thanks' && closingLive) mediaStarted = true;
    readClosing();
    scheduleFrame();
  });
  film.addEventListener('timeupdate', () => {
    if (!film.requestVideoFrameCallback) readClosing();
  });
  film.addEventListener('ended', () => readClosing());
  film.addEventListener('pause', () => {
    cancelFrame();
    if (film.ended || !film.requestVideoFrameCallback) readClosing();
  });
  film.addEventListener('error', () => {
    if (PILOT_RUNTIME.currentId === 'thanks') thanks(false);
  });
  window.addEventListener('pilot:scene',event=>{
    if(event.detail.id==='conclusion'&&exitMove){
      exitTargets=[...document.querySelectorAll('#conclusion .exterior-results,#conclusion .exterior-roles')];gsap.set(exitTargets,{opacity:0,y:8});
      exitMove.to(exitTargets[0],{opacity:1,y:0,duration:.32,ease:'power2.out'},.46)
        .to(exitTargets[1],{opacity:1,y:0,duration:.32,ease:'power2.out'},.54);
    }
    if(event.detail.id==='thanks')thanks(event.detail.live&&!reduced.matches);else stopClosing();
  });
  function syncClosingState(snapshot){
    let audience=false;try{audience=new URL(parent.location.href).searchParams.get('mode')==='audience'||parent.document.querySelector('hyperframes-slideshow')?.getAttribute('mode')==='audience';}catch(_){}
    if(!audience||PILOT_RUNTIME.currentId!=='thanks'||!snapshot)return false;
    const run=String(snapshot.run??''),sequence=Number(snapshot.sequence)||0;
    if(run===remoteRun&&sequence<=remoteSequence)return false;
    const newRun = run !== remoteRun;
    const wasFinished = finishedThanks;
    if (newRun) {
      revealEdge = 0;
      type.reset();
    }
    remoteRun = run;
    remoteSequence = sequence;
    if (reduced.matches) {
      thanks(false);
      return true;
    }
    closingLive = true;
    mediaStarted = true;
    if (snapshot.ended === true) {
      finishClosing();
      return true;
    }
    finishedThanks = false;
    gsap.set(white, {opacity: 0});
    // Use the audience player's frame, including after a late join or seek.
    if (newRun || wasFinished || film.paused) readClosing();
    scheduleFrame();
    return true;
  }
  if(PILOT_RUNTIME.currentId==='thanks')thanks(false);else type.reset();
  reduced.addEventListener('change',()=>{if(reduced.matches){clearExit();if(PILOT_RUNTIME.currentId==='thanks')thanks(false);}});
  window.CINEMATIC = {
    ready: Promise.resolve(true),
    syncClosingState,
    diagnostics: () => ({
      wiperActive: false, wiperFrames: 0, exitActive: !!exitMove && exitMove.isActive(),
      phase, lastTransition, ghosts: exitView.children.length, targetMasked: false,
      thanksActive: closingLive && !finishedThanks, whiteProgress,
      thanksTime: film.currentTime, thanksDuration: film.duration,
      titleShown: revealEdge > 0, revealEdge, revealMediaTime,
      mediaStarted, finishedThanks, closingRun, remoteRun, remoteSequence,
      type: type.diagnostics(),
    }),
    sampleExit: time => { if (exitMove) exitMove.pause().seek(time, false); },
    sampleThanks: time => readClosing(time, true),
  };
})();
