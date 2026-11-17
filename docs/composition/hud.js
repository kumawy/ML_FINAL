/* Driver-view pilot: finite data-driven entrances, exact static end states. */
(function(){
  'use strict';
  const data=window.PILOT_DATA;
  if(!data)throw new Error('Pilot scientific data not loaded');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const runs=new Set(); let entry=null, metric='mae', active='cover';
  function tween(target,vars){let t;const done=vars.onComplete;t=gsap.to(target,{...vars,onComplete(){runs.delete(t);if(done)done();}});runs.add(t);return t;}
  function stop(){runs.forEach(t=>t.kill());runs.clear();if(entry){entry.kill();entry=null;}gsap.set('#entry-transition',{autoAlpha:0});}
  const chart=document.getElementById('comparison-chart');
  const models=data.comparison.models;
  const labels=['Median baseline','Linear regression','KNN · midterm','Tree · midterm','KNN · tuned','Tree · tuned','Random forest','ANN · single','ANN · ensemble'];
  const bars=models.map((model,i)=>{const el=document.createElement('div');el.className='model-row';el.style.top=(i*40)+'px';el.dataset.model=model.model;const label=document.createElement('span');label.className='model-label';label.textContent=labels[i]||model.friendlyLabel;const track=document.createElement('div');track.className='model-track';const bar=document.createElement('div');bar.className='model-bar';track.append(bar);const value=document.createElement('span');value.className='model-value';el.append(label,track,value);chart.append(el);return{model,el,bar,value,state:{v:0}};});
  const axis=document.createElement('div');axis.className='chart-scale';chart.append(axis);
  const metricSettings={
    mae:{field:'test_mae_kzt',min:0,max:6,ticks:[0,2,4,6],divisor:1e6,heading:'Lowest test MAE: ANN ensemble',note:'Test error in million KZT · Lower is better',unit:'million KZT MAE',higher:false},
    rmse:{field:'test_rmse_kzt',min:0,max:12,ticks:[0,4,8,12],divisor:1e6,heading:'Lowest test RMSE: single ANN',note:'Test error in million KZT · Lower is better',unit:'million KZT RMSE',higher:false},
    validation:{field:'validation_mae_kzt',min:0,max:7,ticks:[0,2,4,6,7],divisor:1e6,heading:'Lowest validation MAE: ANN ensemble',note:'Validation error in million KZT · Lower is better',unit:'million KZT validation MAE',higher:false},
    r2:{field:'test_r2',min:-.1,max:1,ticks:[-.1,0,.5,1],divisor:1,heading:'Highest test R²: single ANN',note:'Test R² · Higher is better',unit:'R squared',higher:true}
  };
  function updateComparison(next,animate){const changed=next!==metric;showTable(false);metric=next;const setting=metricSettings[next],field=setting.field,range=setting.max-setting.min;const best=(setting.higher?Math.max:Math.min)(...models.map(m=>m[field]));
    document.getElementById('comparison-heading').textContent=setting.heading;
    document.getElementById('comparison-metric-note').textContent=setting.note;
    document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===next)));
    axis.replaceChildren(...setting.ticks.map(v=>{const el=document.createElement('span');el.textContent=String(v);el.style.position='absolute';el.style.left=((v-setting.min)/range*100)+'%';el.style.transform='translateX(-50%)';return el;}));
    bars.forEach(({model,el,bar,value,state},i)=>{const val=model[field]/setting.divisor;gsap.killTweensOf(state);if(changed)state.v=0;el.dataset.winner=String(model[field]===best);function draw(){bar.style.position='absolute';bar.style.left=((Math.min(0,state.v)-setting.min)/range*100)+'%';bar.style.width=(Math.abs(state.v)/range*100)+'%';value.textContent=state.v.toFixed(3);bar.parentElement.style.setProperty('--zero-position',(-setting.min/range*100)+'%');}if(animate)tween(state,{v:val,duration:.8,delay:i*.035,ease:'power2.out',onUpdate:draw,onComplete(){state.v=val;draw();}});else{state.v=val;draw();}el.setAttribute('aria-label',(labels[i]||model.friendlyLabel)+': '+val.toFixed(3)+' '+setting.unit);});
    chart.setAttribute('aria-label',setting.note+'. '+bars.map(({el})=>el.getAttribute('aria-label')).join('; '));
  }
  function showTable(enabled){const table=document.getElementById('comparison-table'),button=document.getElementById('comparison-table-button');if(!table)return;table.hidden=!enabled;chart.hidden=enabled;chart.style.display=enabled?'none':'';button.setAttribute('aria-pressed',String(enabled));if(enabled){document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed','false'));document.getElementById('comparison-heading').textContent='All nine models on the historical split';document.getElementById('comparison-metric-note').textContent='MAE / RMSE in million KZT · R² is dimensionless';}}
  document.getElementById('comparison-table-button').addEventListener('click',()=>showTable(true));
  document.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>updateComparison(b.dataset.metric,!reduced.matches)));
  const question=document.querySelector('.question-flow');
  function questionStart(animate,delay){const features=[...document.querySelectorAll('.feature-list span')],node=document.querySelector('.model-node'),prediction=document.querySelector('.prediction-node'),criterion=document.querySelector('.criterion'),note=document.querySelector('.question-scene .context-note'),heading=document.querySelector('.question-scene .scene-heading');const lines=[...document.querySelectorAll('.signal-line,.prediction-line')];const arrow=document.querySelector('.arrow-tip');const all=[...features,node,prediction,criterion,note,heading,arrow];gsap.killTweensOf(all);gsap.set(all,{clearProps:'opacity,transform'});for(const l of lines){const len=l.getTotalLength();l.style.strokeDasharray=String(len);l.style.strokeDashoffset='0';}
    if(!animate)return;const tl=gsap.timeline({delay:delay||0});runs.add(tl);tl.from(heading,{opacity:0,x:16,duration:.55,ease:'power2.out'},0).from(features,{opacity:0,x:-16,duration:.4,stagger:.07,ease:'power2.out'},.12).from(node,{opacity:0,duration:.45},.45).from(prediction,{opacity:0,duration:.5},1).from(arrow,{opacity:0,duration:.4},1).from(criterion,{opacity:0,duration:.5},1.25).from(note,{opacity:0,duration:.5},1.4);lines.forEach((l,i)=>{tl.fromTo(l,{strokeDashoffset:l.getTotalLength()},{strokeDashoffset:0,duration:.65,ease:'power1.inOut'},.35+(i<5?i*.04:.45));});tl.eventCallback('onComplete',()=>runs.delete(tl));
  }
  function enterCockpit(){const overlay=document.getElementById('entry-transition'),photo=overlay.querySelector('img'),glint=overlay.querySelector('.windshield-glint'),back=document.querySelector('.cockpit-backplate');entry=gsap.timeline();entry.set(overlay,{autoAlpha:1}).set(photo,{opacity:1,scale:1,x:0,y:0}).set(glint,{opacity:0,xPercent:-40}).fromTo(back,{scale:1.08},{scale:1,duration:1.12,ease:'power2.out'},0).to(photo,{scale:6.2,x:-480,y:36,duration:1.05,ease:'power3.in'},0).to(glint,{opacity:.85,xPercent:40,duration:.74,ease:'power1.inOut'},.39).to(photo,{opacity:0,duration:.32},.72).to(glint,{opacity:0,duration:.30},.92).set(overlay,{autoAlpha:0},1.24);}
  function activate(detail){stop();active=detail.id||detail.sceneId;const animate=detail.live&&!reduced.matches;if(active==='question'){const entering=animate&&detail.transition==='enter-cockpit';questionStart(animate,entering?.85:0);if(entering)enterCockpit();}if(active==='comparison'){bars.forEach(b=>b.state.v=0);updateComparison('mae',animate);}}
  updateComparison('mae',false);
  window.addEventListener('pilot:scene',e=>activate(e.detail));
  activate(window.PILOT_RUNTIME.current());
  window.PILOT_HUD={showTable:()=>showTable(true),replayPCA:()=>window.PCA3D?.reset(),setMetric:(m)=>{if(!Object.hasOwn(metricSettings,m))throw new Error('Unknown metric');updateComparison(m,false);},diagnostics:()=>({scene:active,pointCount:data.pca.points.length,pcaView:window.PCA3D?.diagnostics().view,pcaAllInBounds:window.PCA3D?.diagnostics().allInBounds,metric,modelCount:models.length,transitionActive:!!entry&&entry.isActive(),animationsRunning:[...runs].filter(t=>t.isActive()).length,values:bars.map(b=>({model:b.model.model,value:b.state.v}))})};
})();
