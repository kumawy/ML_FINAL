/* Late presenter joins ask for an authoritative native media snapshot.
 * Playback remains owned by HyperFrames: this adapter uses onRemoteMedia(),
 * with a precise join/end seek, then updates the composition's graphic cue.
 * No alternate clock, manual play/pause, or vendor modifications. */
(function () {
  'use strict';
  const slideshow=document.querySelector('hyperframes-slideshow');
  const player=slideshow?.querySelector('hyperframes-player');
  if(!slideshow||!player||!window.BroadcastChannel)return;
  const role=new URLSearchParams(location.search).get('mode')==='audience'?'audience':'presenter';
  const id=crypto.randomUUID?.()||Math.random().toString(36).slice(2);
  const channel=new BroadcastChannel('ml-final-native-closing-v1:'+location.pathname);
  let frame=null,win=null,doc=null,film=null,unbind=null,watchTimer=null,authority=null;
  let sent=0,received=0,applied=0,requests=0,lastSequence=-1,alignedRun=null,applySerial=0,lastSend=0;
  let lastState=null,lastError=null,requestTimers=[];
  const timers=()=>{requestTimers.forEach(clearTimeout);requestTimers=[];};
  const active=()=>win?.PILOT_RUNTIME?.currentId==='thanks';
  function entry(){return slideshow.mediaEntries?.().find(item=>item.el===film)||null;}
  function snapshot(to){
    if(role!=='presenter'||!active()||!film)return;
    const media=entry(),d=win.CINEMATIC?.diagnostics();if(!media||!d)return;
    // Do not publish an old endpoint during entry before native autoplay has
    // rewound/armed this run. Explicit static/ended rest remains authoritative.
    if(!d.mediaStarted&&!d.finishedThanks)return;
    const ended=film.ended||d.finishedThanks===true;
    const state={type:'state',from:id,to:to||null,sequence:++sent,run:id+':'+d.closingRun,
      scene:'thanks',key:media.key,time:film.currentTime,duration:film.duration,
      paused:ended||film.paused,ended,muted:film.muted,volume:film.volume,playbackRate:film.playbackRate,
      titleShown:d.titleShown===true,typeState:d.type?.state||'hidden'};
    if(!Number.isFinite(state.duration)||state.duration<=0)return;
    channel.postMessage(state);lastSend=performance.now();
  }
  function request(){
    if(role!=='audience'||!active())return;
    requests++;channel.postMessage({type:'request',from:id,to:authority});
  }
  function requestScene(){
    timers();if(role!=='audience'||!active())return;
    // Bounded retries cover native initial-position bursts and metadata startup.
    for(const delay of [0,80,300,750,1500,3000,5000])requestTimers.push(setTimeout(request,delay));
  }
  function settled(video,serial){
    if(!video.seeking)return Promise.resolve(true);
    return new Promise(resolve=>{
      let timer;const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);resolve(serial===applySerial&&!video.seeking);};
      video.addEventListener('seeked',done,{once:true});timer=setTimeout(()=>{video.removeEventListener('seeked',done);resolve(false);},1500);
    });
  }
  async function apply(state){
    if(!active()||!film||film.readyState<1||typeof slideshow.onRemoteMedia!=='function')return;
    const serial=++applySerial,newRun=state.run!==alignedRun;
    const native={type:'media',sender:'presenter',key:entry()?.key||state.key,
      action:state.ended?'ended':state.paused?'pause':'play',currentTime:state.time,
      paused:state.paused,ended:state.ended,muted:state.muted,volume:state.volume,playbackRate:state.playbackRate};
    slideshow.onRemoteMedia(native);
    // Native sync intentionally tolerates .35 s drift. A first join/new run
    // needs a precise seek, and an explicit primary endpoint must not pause
    // the audience a few frames short. Playback still uses the native handler.
    if(newRun||state.ended){
      const time=state.ended?film.duration:Math.min(film.duration,Math.max(0,state.time));
      if(Number.isFinite(time)&&Math.abs(film.currentTime-time)>.005)film.currentTime=time;
    }
    alignedRun=state.run;
    if(!await settled(film,serial)||serial!==applySerial||!active())return;
    const cue={...state,time:state.ended?state.duration:state.time};
    if(win.CINEMATIC?.syncClosingState?.(cue)){applied++;lastState=state;lastError=null;}
    if(state.ended)timers();
  }
  channel.onmessage=event=>{
    const state=event.data;
    if(!state||state.from===id)return;
    if(role==='presenter'){
      if(state.type==='request'&&(!state.to||state.to===id))snapshot(state.from);
      return;
    }
    if(state.type!=='state'||(state.to&&state.to!==id)||!active())return;
    if(!authority){if(state.to!==id)return;authority=state.from;}
    if(state.from!==authority||!Number.isSafeInteger(state.sequence)||state.sequence<=lastSequence)return;
    if(!Number.isFinite(state.time)||!Number.isFinite(state.duration)||state.duration<=0||typeof state.run!=='string')return;
    received++;lastSequence=state.sequence;lastState=state;
    apply(state).catch(error=>{lastError=String(error);});
  };
  function bind(){
    const next=player.iframeElement;
    if(next&&next!==frame){frame=next;frame.addEventListener('load',watch);}
    let view;try{view=next?.contentWindow;}catch(_){return false;}
    if(!view?.PILOT_RUNTIME?.ready||!view.CINEMATIC?.diagnostics)return false;
    if(doc===view.document)return true;
    unbind?.();applySerial++;timers();win=view;doc=view.document;film=doc.getElementById('thanks-film');
    if(!film)return false;
    const onScene=()=>{applySerial++;timers();if(role==='audience')requestScene();else setTimeout(()=>snapshot(),0);};
    const onMedia=event=>{if(role==='presenter'&&(event.type!=='timeupdate'||performance.now()-lastSend>250))setTimeout(()=>snapshot(),0);};
    const onMetadata=()=>{if(role==='audience')requestScene();};
    view.addEventListener('pilot:scene',onScene);
    for(const name of ['play','pause','seeked','ended','timeupdate'])film.addEventListener(name,onMedia);
    film.addEventListener('loadedmetadata',onMetadata);
    unbind=()=>{view.removeEventListener('pilot:scene',onScene);for(const name of ['play','pause','seeked','ended','timeupdate'])film.removeEventListener(name,onMedia);film.removeEventListener('loadedmetadata',onMetadata);};
    if(role==='audience')requestScene();return true;
  }
  function watch(){clearTimeout(watchTimer);if(!bind())watchTimer=setTimeout(watch,80);}
  window.FINALE_SYNC={diagnostics:()=>({role,id,bound:!!film,authority,sent,received,applied,requests,lastSequence,alignedRun,lastState,lastError})};
  addEventListener('pagehide',()=>{clearTimeout(watchTimer);timers();applySerial++;unbind?.();channel.close();},{once:true});
  watch();
})();
