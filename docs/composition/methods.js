/* Four evidence-driven scenes. All visual data come from the saved study outputs. */
(function(){
  'use strict';
  const D=window.DECK_DATA;
  if(!D?.csv||!D?.report)throw new Error('DECK_DATA evidence is required for methods scenes');
  const C=D.csv,R=D.report,U=D.unsupervised||R.unsupervised;
  const NS='http://www.w3.org/2000/svg';
  const color={ice:'#b5e9f4',sand:'#e0c69b',lilac:'#bfafd9',blue:'#7196b7',muted:'#a5b1b9',white:'#edf3f4'};
  const clusterColors=[color.ice,color.sand,color.lilac,color.blue];
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const sceneIds=new Set(['supervised','clusters','ann','errors']);
  const errorBarStates=new Map();
  let activeTimeline=null,activeScene=null;
  function el(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=String(text);return n;}
  function add(parent,tag,attrs,text){const n=el(tag,attrs,text);parent.append(n);return n;}
  function svg(id,w,h,label){const s=el('svg',{viewBox:`0 0 ${w} ${h}`,width:w,height:h,role:'img','aria-label':label});document.getElementById(id).replaceChildren(s);return s;}
  function text(s,x,y,value,cls='m-small-label',anchor='start'){return add(s,'text',{x,y,class:cls,'text-anchor':anchor},value);}
  const million=v=>Number(v)/1e6;
  const number=(v,n=3)=>Number(v).toFixed(n);

  // Three systems use the same shuffled training folds. SD is across those folds.
  const cv=R.supervised.cv_results;
  const configs={
    'KNN tuned':['5 neighbours · Manhattan','Distance weighting'],
    'Tree tuned':['Depth 10 · leaf ≥3',''],
    'Random forest tuned':['200 trees · max features .7','Leaf ≥1']
  };
  const labels={'KNN tuned':'KNN','Tree tuned':'Decision tree','Random forest tuned':'Random forest'};
  const lanes=document.getElementById('m-cv-lanes');
  for(const row of cv){
    const lane=document.createElement('div');lane.className='m-cv-lane';lane.dataset.model=row.model;
    lane.dataset.maeKzt=row.cv_mae_kzt;lane.dataset.sdKzt=row.cv_std_mae_kzt;
    const name=document.createElement('p');name.className='m-cv-name';name.textContent=labels[row.model];
    const score=document.createElement('div');
    const value=document.createElement('p');value.className='m-cv-score';value.append(document.createTextNode(number(million(row.cv_mae_kzt))+' '));
    const sd=document.createElement('span');sd.textContent='± '+number(million(row.cv_std_mae_kzt));value.append(sd);score.append(value);
    const config=document.createElement('p');config.className='m-cv-config';config.textContent=configs[row.model][0];
    if(configs[row.model][1]){const detail=document.createElement('small');detail.textContent=configs[row.model][1];config.append(detail);}
    lane.append(name,score,config);lanes.append(lane);
  }

  // K selection remains in the complete three-dimensional numeric feature space.
  const selection=C.cluster_selection;
  const selected=selection.reduce((a,b)=>b.silhouette>a.silhouette?b:a);
  const kSvg=svg('m-silhouette',730,320,'Training silhouette for k=2 through 8; k=4 is highest at '+selected.silhouette.toFixed(6)+'.');
  const kBox={left:120,right:704,top:35,bottom:252};
  const kx=k=>kBox.left+(k-2)/6*(kBox.right-kBox.left);
  const ky=v=>kBox.bottom-(v-.30)/.09*(kBox.bottom-kBox.top);
  for(const y of [.30,.33,.36,.39]){add(kSvg,'line',{x1:kBox.left,x2:kBox.right,y1:ky(y),y2:ky(y),class:'m-grid'});text(kSvg,kBox.left-14,ky(y)+9,y.toFixed(2),'m-small-label','end');}
  for(const row of selection)text(kSvg,kx(row.k),280,row.k,'m-main-label','middle');
  add(kSvg,'path',{d:selection.map((row,i)=>(i?'L':'M')+kx(row.k)+' '+ky(row.silhouette)).join(' '),fill:'none',stroke:color.ice,'stroke-width':3,class:'m-draw-path'});
  for(const row of selection)add(kSvg,'circle',{cx:kx(row.k),cy:ky(row.silhouette),r:row.k===selected.k?8:5.5,fill:row.k===selected.k?color.sand:color.ice,class:'m-data-point','data-k':row.k,'data-silhouette':row.silhouette});
  text(kSvg,kx(selected.k)+15,ky(selected.silhouette)-16,selected.silhouette.toFixed(3),'m-value');
  const kY=(kBox.top+kBox.bottom)/2;
  text(kSvg,28,kY,'Silhouette','m-axis-title','middle').setAttribute('transform',`rotate(-90 28 ${kY})`);
  text(kSvg,(kBox.left+kBox.right)/2,318,'Clusters (k)','m-axis-title','middle');
  const profiles=document.getElementById('m-cluster-profiles');
  for(const row of C.cluster_profiles){
    const tr=document.createElement('tr');tr.dataset.cluster=row.cluster;
    const values=[row.cluster,row.count,row.median_year,number(row.median_mileage_km/1000,1).replace(/\.0$/,''),number(row.median_engine_liters,1),number(million(row.median_price_kzt),3)];
    values.forEach((v,i)=>{const td=document.createElement('td');if(i===0){const dot=document.createElement('i');dot.className='m-profile-dot';dot.style.background=clusterColors[row.cluster];td.append(dot);}td.append(document.createTextNode(String(v)));tr.append(td);});profiles.append(tr);
  }

  // Plot the ordinary MSE history, while making the different checkpoint metric explicit.
  const history=C.ann_history.filter(row=>row.candidate_id===R.ann.selected_candidate_id);
  const ann=R.ann,candidate=ann.candidates.find(row=>row.candidate_id===ann.selected_candidate_id);
  const aSvg=svg('m-ann-curves',1030,346,'All '+history.length+' epochs of ordinary MSE on standardized log1p price; excludes the optimizer one-half factor and L2 term. Validation-MAE checkpoint at epoch '+ann.best_epoch+'.');
  const aBox={left:88,right:1000,top:35,bottom:275};
  const ax=v=>aBox.left+(v-1)/(ann.epochs_run-1)*(aBox.right-aBox.left);
  const ay=v=>aBox.bottom-v/.35*(aBox.bottom-aBox.top);
  for(const y of [0,.1,.2,.3]){add(aSvg,'line',{x1:aBox.left,x2:aBox.right,y1:ay(y),y2:ay(y),class:'m-grid'});text(aSvg,aBox.left-15,ay(y)+9,y.toFixed(1),'m-small-label','end');}
  for(const epoch of [1,25,50,71,100,111]){text(aSvg,ax(epoch),300,epoch,'m-small-label','middle');}
  for(const[field,stroke]of [['train_scaled_log_mse',color.ice],['val_scaled_log_mse',color.sand]])add(aSvg,'path',{d:history.map((row,i)=>(i?'L':'M')+ax(row.epoch)+' '+ay(row[field])).join(' '),fill:'none',stroke,'stroke-width':3.4,class:'m-draw-path','data-history-field':field,'data-epochs':history.length});
  const checkpoint=add(aSvg,'g',{class:'m-checkpoint-mark'});
  add(checkpoint,'line',{x1:ax(ann.best_epoch),x2:ax(ann.best_epoch),y1:aBox.top,y2:aBox.bottom,stroke:color.muted,'stroke-width':1.5,'stroke-dasharray':'7 7'});
  text(checkpoint,ax(ann.best_epoch)+12,23,'MAE checkpoint 71','m-small-label');
  text(aSvg,(aBox.left+aBox.right)/2,340,'Epoch','m-axis-title','middle');
  document.getElementById('m-ann-epoch').textContent='epoch '+ann.best_epoch;
  document.getElementById('m-ann-train').textContent=number(million(candidate.checkpoint_train_mae_kzt));
  document.getElementById('m-ann-val').textContent=number(million(ann.best_validation_mae_kzt));
  document.getElementById('m-ann-deterioration').textContent=number(100*ann.assessment.validation_mae_deterioration_after_best_fraction,2)+'%';

  function errorChart(id,rows,key,labels,left,inlineCounts=false){
    const w=776,h=270,s=svg(id,w,h,'Frozen ensemble historical-test mean absolute error, in million KZT. '+rows.map(row=>labels[row[key]]+', n='+row.count+', MAE '+million(row.mae_kzt).toFixed(3)).join('; '));
    const b={left,right:w-85,top:24,bottom:212};
    const x=v=>b.left+v/5*(b.right-b.left);
    for(const v of [0,1,2,3,4,5]){add(s,'line',{x1:x(v),x2:x(v),y1:9,y2:b.bottom+5,class:v===0?'m-axis':'m-grid'});text(s,x(v),242,v,'m-small-label','middle');}
    const step=(b.bottom-b.top+10)/rows.length;
    rows.forEach((row,i)=>{const y=b.top+i*step;const label=labels[row[key]],v=million(row.mae_kzt);
      if(inlineCounts){const line=text(s,b.left-18,y+25,label,'m-main-label','end');add(line,'tspan',{'font-size':28,fill:color.muted},' · n='+row.count);}
      else{text(s,b.left-18,y+7,label,'m-main-label','end');text(s,b.left-18,y+36,'n = '+row.count,'m-small-label','end');}
      const width=x(v)-b.left;
      const bar=add(s,'rect',{x:b.left,y:y+6,width,height:16,fill:i===rows.length-1?color.ice:color.blue,opacity:i===rows.length-1?1:.85,class:'m-error-bar','data-group':row[key],'data-count':row.count,'data-mae-kzt':row.mae_kzt});
      errorBarStates.set(bar,{width,state:{value:width}});
      text(s,x(v)+13,y+25,v.toFixed(2),'m-value');});
    text(s,(b.left+b.right)/2,268,'MAE · million KZT','m-chart-unit','middle');return s;
  }
  errorChart('m-price-errors',C.error_by_price_band,'price_band',{Q1:'Q1',Q2:'Q2',Q3:'Q3',Q4:'Q4'},210,true);
  errorChart('m-support-errors',C.error_by_model_support,'model_support',{unseen:'Unseen',rare_1_to_4:'1–4 examples',seen_5plus:'5+ examples'},231);
  const electric=C.error_by_fuel.find(row=>row.fuel==='electric');
  const eqs=C.largest_errors.find(row=>row.model==='EQS SUV');
  const q4=C.error_by_price_band.find(row=>row.price_band==='Q4');
  const ensemble=C.model_comparison.find(row=>row.model==='ANN ensemble');
  const testRows=R.data.splits.test;
  const coverage=Math.round(ensemble.test_within_20pct*testRows);
  document.getElementById('m-error-coverage').textContent=coverage+' / '+testRows;
  document.getElementById('m-error-electric').textContent=million(electric.mae_kzt).toFixed(2)+'m KZT';
  document.getElementById('m-error-eqs').textContent=million(eqs.price).toFixed(1)+'m → '+million(eqs.prediction_kzt).toFixed(1)+'m';
  document.getElementById('m-error-residual').textContent=(q4.mean_residual_kzt>=0?'+':'')+million(q4.mean_residual_kzt).toFixed(2)+'m KZT';

  // Each entrance is finite. Rest state is complete; exits kill their own work.
  function restore(scene){
    scene.querySelectorAll('.m-draw-path').forEach(p=>{const length=p.getTotalLength();p.style.strokeDasharray=String(length);p.style.strokeDashoffset='0';});
    const marks=scene.querySelectorAll('.m-data-point,.m-checkpoint-mark,.m-cv-score');
    if(marks.length)gsap.set(marks,{opacity:1});
    for(const bar of scene.querySelectorAll('.m-error-bar')){const saved=errorBarStates.get(bar);saved.state.value=saved.width;bar.setAttribute('width',saved.width);}
  }
  function stop(){if(activeTimeline){activeTimeline.kill();activeTimeline=null;}if(activeScene)restore(activeScene);}
  function activate(detail){
    stop();const id=detail.id||detail.sceneId;activeScene=null;
    if(!sceneIds.has(id))return;
    activeScene=document.querySelector('[data-scene-id="'+id+'"]');if(!activeScene)return;restore(activeScene);
    if(!detail.live||detail.static||reduced.matches)return;
    const tl=gsap.timeline();activeTimeline=tl;
    const cvScores=activeScene.querySelectorAll('.m-cv-score');if(cvScores.length)tl.fromTo(cvScores,{opacity:.2},{opacity:1,duration:.35,stagger:.12},.10);
    for(const p of activeScene.querySelectorAll('.m-draw-path')){const length=p.getTotalLength();tl.fromTo(p,{strokeDashoffset:length},{strokeDashoffset:0,duration:id==='ann'?1.65:1.25,ease:'power1.inOut'},.12);}
    const dots=activeScene.querySelectorAll('.m-data-point');if(dots.length)tl.fromTo(dots,{opacity:0},{opacity:1,duration:.25,stagger:.06},.30);
    // Animate the encoded SVG length, not a transformed rectangle. The x/y
    // coordinates remain fixed at the actual zero axis throughout the reveal.
    activeScene.querySelectorAll('.m-error-bar').forEach((bar,i)=>{
      const saved=errorBarStates.get(bar);saved.state.value=0;bar.setAttribute('width',0);
      tl.to(saved.state,{value:saved.width,duration:.82,ease:'power2.out',onUpdate(){bar.setAttribute('width',saved.state.value);}},.10+i*.055);
    });
    const mark=activeScene.querySelector('.m-checkpoint-mark');if(mark)tl.fromTo(mark,{opacity:0},{opacity:1,duration:.35},1.65);
  }
  document.querySelectorAll('.methods-scene').forEach(restore);
  window.addEventListener('pilot:scene',event=>activate(event.detail));
  if(window.PILOT_RUNTIME)activate(window.PILOT_RUNTIME.current());
  window.METHODS_HUD={diagnostics(){return{
    scene:activeScene?.dataset.sceneId||null,animationRunning:Boolean(activeTimeline?.isActive()),
    supervised:cv.map(row=>({model:row.model,maeKzt:row.cv_mae_kzt,foldSdKzt:row.cv_std_mae_kzt})),
    clusters:{selectedK:selected.k,silhouette:selected.silhouette,fitRows:U.fit_rows,profiles:C.cluster_profiles},
    ann:{epochs:history.length,checkpoint:ann.best_epoch,trainCheckpointMae:candidate.checkpoint_train_mae_kzt,validationCheckpointMae:ann.best_validation_mae_kzt,historyFields:['train_scaled_log_mse','val_scaled_log_mse']},
    errors:{priceCounts:C.error_by_price_band.map(row=>row.count),supportCounts:C.error_by_model_support.map(row=>row.count),coverage,testRows,electricCount:electric.count,eqsPrediction:eqs.prediction_kzt}
  };}};
})();
