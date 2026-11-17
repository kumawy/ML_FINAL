/* Printed uppercase lockup; shared lifecycle with the native car finale. */
(function(){
  'use strict';
  const root=document.getElementById('thanks-title')||document.querySelector('.thanks-title');
  if(!root)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let timeline=null,state='rest',duration=.52,fontsReady=false,revealEdge=1920;
  root.replaceChildren();root.dataset.finaleType='v5-rubber';root.setAttribute('aria-label','THANK YOU!');
  ['THANK','YOU!'].forEach((word,i)=>{if(i)root.append(document.createTextNode(' '));const span=document.createElement('span');span.className='finale-word '+(i?'finale-you':'finale-thank');span.setAttribute('aria-hidden','true');span.textContent=word;root.append(span);});
  const words=Array.from(root.querySelectorAll('.finale-word'));
  function alignTexture(){const origin=words[0].offsetLeft;words.forEach(word=>{word.style.backgroundPosition=(origin-word.offsetLeft)+'px 0px';});}
  function cancel(){if(timeline){timeline.kill();timeline=null;}}
  function rest(){cancel();state='rest';revealEdge=1920;root.style.clipPath='none';gsap.set(root,{opacity:1,y:0});gsap.set(words,{autoAlpha:1,y:0,yPercent:0,rotation:0});alignTexture();return diagnostics();}
  function reset(){cancel();state='hidden';revealEdge=0;root.style.clipPath='none';gsap.set(root,{opacity:0,y:0});gsap.set(words,{autoAlpha:1,y:0,yPercent:0,rotation:0});return diagnostics();}
  // Presented-frame path: cached references, scalar math and style writes only.
  function trackTo(x){
    if(timeline)cancel();
    revealEdge=Math.max(0,Math.min(1920,Number(x)||0));
    state=revealEdge<=0?'hidden':revealEdge>=1920?'rest':'tracking';
    root.style.transform='none';root.style.opacity=revealEdge>0?'1':'0';
    root.style.clipPath=revealEdge>=1920?'none':'inset(0px '+(1920-revealEdge)+'px 0px 0px)';
    return revealEdge;
  }
  function reveal(options){
    options=options||{};reset();duration=Math.min(.6,Math.max(.45,Number(options.duration)||.52));
    if(reduced.matches||options.animate===false){rest();return null;}
    state='revealing';revealEdge=1920;gsap.set(root,{y:8});timeline=gsap.timeline({delay:Math.max(0,Number(options.delay)||0),onComplete:function(){state='rest';}});
    timeline.to(root,{opacity:1,y:0,duration:duration,ease:'power2.out'},0);return timeline;
  }
  function diagnostics(){
    const style=getComputedStyle(root),opacity=Number(style.opacity),box=root.getBoundingClientRect();
    return{ready:true,version:6,text:root.textContent.replace(/\s+/g,' ').trim(),accessibleLabel:root.getAttribute('aria-label'),wordCount:words.length,state:state,revealEdge:revealEdge,running:!!timeline&&timeline.isActive(),duration:duration,reducedMotion:reduced.matches,fontsReady:fontsReady,fontFamily:style.fontFamily,fontWeight:Number(style.fontWeight),italicWords:words.filter(word=>getComputedStyle(word).fontStyle==='italic').length,visibleWords:opacity>.001?words.filter(word=>Number(getComputedStyle(word).opacity)>.001).length:0,box:{left:box.left,top:box.top,right:box.right,bottom:box.bottom},texture:getComputedStyle(words[0]).backgroundImage};
  }
  const ready=document.fonts.load('800 264px "Finale Print"').then(function(){fontsReady=document.fonts.check('800 264px "Finale Print"');alignTexture();return fontsReady;});
  window.FINALE_TYPE={trackTo:trackTo,reveal:reveal,rest:rest,reset:reset,diagnostics:diagnostics,ready:ready};
  reduced.addEventListener('change',function(){if(reduced.matches&&state==='revealing')rest();});
  rest();
})();
