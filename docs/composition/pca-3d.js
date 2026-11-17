/* Real, event-driven orthographic 3D: rotate the saved PC1/PC2/PC3 scores.
 * No model fitting, subsampling, jitter, bitmap rotation or continuous animation. */
(function(){
  'use strict';
  const canvas=document.getElementById('pca-3d-canvas');
  if(!canvas)return;
  const data=window.PILOT_DATA?.pca;
  if(!data||!Array.isArray(data.points)||!data.points.length)throw new Error('PCA score data is unavailable');
  const points=data.points;
  if(points.some(p=>!['PC1','PC2','PC3'].every(k=>Number.isFinite(p[k]))))throw new Error('PCA score coordinates must be finite');
  const ctx=canvas.getContext('2d');
  const W=1180,H=510,DPR=2,CX=W/2,CY=H/2;
  canvas.width=W*DPR;canvas.height=H*DPR;
  const colors=['#b5e9f4','#e0c69b','#bfafd9','#7196b7'];
  const DEFAULT={yaw:-.60,pitch:.40,zoom:.90};
  const pose={...DEFAULT,depth:1};
  let view='3d',active=window.PILOT_RUNTIME?.currentId==='pca',drag=null,frame=null,tween=null,target=null,pendingBroadcast=false;
  let drawCount=0,drawnPointCount=0,allInBounds=true,lastBounds=null;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const live=new URLSearchParams(location.search).get('live')==='1';
  const radius=Math.max(...points.map(p=>Math.hypot(p.PC1,p.PC2,p.PC3)));
  const maxAbs=Math.max(...points.flatMap(p=>[Math.abs(p.PC1),Math.abs(p.PC2),Math.abs(p.PC3)]));
  const axisExtent=Math.max(2,Math.ceil(maxAbs)),gridExtent=Math.min(4,axisExtent/2);
  const fitRadius=Math.max(radius,axisExtent,Math.sqrt(3)*gridExtent);
  const baseScale=(Math.min(W,H)/2-43)/fitRadius;
  // A planar projection has no camera orbit: fit its actual score ranges,
  // independently of the sphere required by the freely rotating 3D view.
  const planeBounds={minX:Math.floor(Math.min(...points.map(p=>p.PC1))),maxX:Math.ceil(Math.max(...points.map(p=>p.PC1))),minY:Math.floor(Math.min(...points.map(p=>p.PC2))),maxY:Math.ceil(Math.max(...points.map(p=>p.PC2)))};
  const planeCenter={x:(planeBounds.minX+planeBounds.maxX)/2,y:(planeBounds.minY+planeBounds.maxY)/2};
  const planeScreenCenterY=(65+H-40)/2;
  const planeScale=Math.min((W-140)/(planeBounds.maxX-planeBounds.minX),(H-105)/(planeBounds.maxY-planeBounds.minY));
  const variance3D=data.variance.reduce((sum,row)=>sum+row.explained_variance_ratio,0);
  const variance2D=data.variance.slice(0,2).reduce((sum,row)=>sum+row.explained_variance_ratio,0);
  const varianceNode=document.getElementById('pca3d-variance'),viewLabel=document.getElementById('pca3d-view-label'),hint=document.getElementById('pca3d-hint');
  const buttons=[...document.querySelectorAll('[data-pca-view]')];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const wrap=v=>((v+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
  let channel=null,sent=0,received=0,scope='',audience=false;
  const sender=window.crypto?.randomUUID?.()||String(Date.now())+'-'+String(Math.random());

  function rotate(x,y,z){
    const c=Math.cos(pose.yaw),s=Math.sin(pose.yaw),cp=Math.cos(pose.pitch),sp=Math.sin(pose.pitch);
    const rx=x*c+z*s,rz=-x*s+z*c;
    return{x:rx,y:y*cp-rz*sp,z:y*sp+rz*cp};
  }
  function camera(){const d=clamp(pose.depth,0,1),scale=(baseScale*d+planeScale*(1-d))*pose.zoom;return{scale,x:CX-planeCenter.x*(1-d)*scale,y:CY*d+planeScreenCenterY*(1-d)+planeCenter.y*(1-d)*scale};}
  function project(x,y,z){const p=rotate(x,y,z),c=camera();return{x:c.x+p.x*c.scale,y:c.y-p.y*c.scale,z:p.z};}
  function line(a,b,color,width){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function grid3D(){
    const axes=[[1,0,0],[0,1,0],[0,0,1]],faces=[];
    for(let fixed=0;fixed<3;fixed++){
      const depth=rotate(...axes[fixed]).z,side=depth>=0?-gridExtent:gridExtent;
      const varying=[0,1,2].filter(i=>i!==fixed);
      function vertex(a,b){const v=[0,0,0];v[fixed]=side;v[varying[0]]=a;v[varying[1]]=b;return project(...v);}
      const corners=[vertex(-gridExtent,-gridExtent),vertex(gridExtent,-gridExtent),vertex(gridExtent,gridExtent),vertex(-gridExtent,gridExtent)];
      faces.push({z:corners.reduce((s,p)=>s+p.z,0)/4,corners,vertex});
    }
    faces.sort((a,b)=>a.z-b.z);
    for(const face of faces){
      ctx.beginPath();face.corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='rgba(181,233,244,.018)';ctx.fill();
      for(let v=-gridExtent;v<=gridExtent+.0001;v+=2){line(face.vertex(v,-gridExtent),face.vertex(v,gridExtent),'rgba(181,233,244,.17)',1);line(face.vertex(-gridExtent,v),face.vertex(gridExtent,v),'rgba(181,233,244,.17)',1);}
    }
  }
  function grid2D(){
    for(let x=planeBounds.minX;x<=planeBounds.maxX;x++)line(project(x,planeBounds.minY,0),project(x,planeBounds.maxY,0),x===0?'rgba(211,225,231,.44)':'rgba(181,233,244,.13)',x===0?1.4:1);
    for(let y=planeBounds.minY;y<=planeBounds.maxY;y++)line(project(planeBounds.minX,y,0),project(planeBounds.maxX,y,0),y===0?'rgba(211,225,231,.44)':'rgba(181,233,244,.13)',y===0?1.4:1);
  }
  function labels2D(){
    const bottomLeft=project(planeBounds.minX,planeBounds.minY,0),topRight=project(planeBounds.maxX,planeBounds.maxY,0);
    ctx.globalAlpha=1;ctx.font='25px Manrope, sans-serif';ctx.fillStyle='#b7c9d1';ctx.textBaseline='middle';ctx.textAlign='center';
    for(let x=planeBounds.minX;x<=planeBounds.maxX;x++){const p=project(x,planeBounds.minY,0);ctx.fillText(String(x),p.x,p.y+22);}
    ctx.textAlign='right';for(let y=planeBounds.minY;y<=planeBounds.maxY;y++){const p=project(planeBounds.minX,y,0);ctx.fillText(String(y),p.x-14,p.y);}
    ctx.font='600 31px Manrope, sans-serif';ctx.fillStyle='#dce8ed';ctx.textAlign='left';ctx.fillText('PC1',topRight.x+25,bottomLeft.y+21);
    ctx.save();ctx.translate(bottomLeft.x-65,(bottomLeft.y+topRight.y)/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillText('PC2',0,0);ctx.restore();
  }
  function axes(){
    const count=pose.depth<.00001?2:3,out=[];
    for(let i=0;i<count;i++){
      const start=[0,0,0],end=[0,0,0];start[i]=-axisExtent;end[i]=axisExtent;
      const a=project(...start),b=project(...end),origin=project(0,0,0);
      line(a,origin,'rgba(211,225,231,.38)',1.25);line(origin,b,'rgba(221,236,242,.72)',1.65);
      out.push({i,a,b,origin});
    }
    return out;
  }
  function labels(axisList){
    const origin=project(0,0,0);
    const occupied=[];
    const overlaps=rect=>occupied.some(other=>rect.x<other.x+other.w+7&&rect.x+rect.w+7>other.x&&rect.y<other.y+other.h+6&&rect.y+rect.h+6>other.y);
    ctx.globalAlpha=1;ctx.textBaseline='middle';ctx.font='600 31px Manrope, sans-serif';
    for(const axis of axisList){
      const name='PC'+(axis.i+1),width=ctx.measureText(name).width;
      let dx=axis.b.x-origin.x,dy=axis.b.y-origin.y,length=Math.hypot(dx,dy);
      if(length<40){const a=[-.28,-2.2,1.2][axis.i];dx=Math.cos(a)*80;dy=Math.sin(a)*80;length=80;}
      const lx=origin.x+dx+dx/length*20,ly=origin.y+dy+dy/length*20;
      let rect={x:clamp(lx-width/2,18,W-width-18),y:clamp(ly-16,17,H-48),w:width,h:32};
      for(let j=0;j<5&&overlaps(rect);j++)rect.y=clamp(rect.y+(axis.i%2?35:-35),17,H-48);
      ctx.fillStyle='#dce8ed';ctx.textAlign='left';ctx.fillText(name,rect.x,rect.y+16);occupied.push(rect);
    }
    ctx.font='25px Manrope, sans-serif';ctx.fillStyle='#aabcc5';
    for(const axis of axisList){
      const screenLength=Math.hypot(axis.b.x-axis.a.x,axis.b.y-axis.a.y);if(screenLength<110)continue;
      const nx=-(axis.b.y-axis.a.y)/screenLength,ny=(axis.b.x-axis.a.x)/screenLength;
      for(let v=-Math.floor(axisExtent/4)*4;v<=axisExtent;v+=4){if(!v)continue;const p=[0,0,0];p[axis.i]=v;const tick=project(...p);line({x:tick.x-nx*4,y:tick.y-ny*4},{x:tick.x+nx*4,y:tick.y+ny*4},'rgba(211,225,231,.55)',1);
        const text=String(v),width=ctx.measureText(text).width,rect={x:tick.x+nx*16-width/2,y:tick.y+ny*16-13,w:width,h:26};
        if(rect.x<12||rect.x+rect.w>W-12||rect.y<13||rect.y+rect.h>H-34||overlaps(rect))continue;
        ctx.textAlign='left';ctx.fillStyle='#aabcc5';ctx.fillText(text,rect.x,rect.y+13);occupied.push(rect);
      }
    }
    ctx.fillStyle='#b7c9d1';ctx.textAlign='left';ctx.font='24px Manrope, sans-serif';ctx.fillText('0',origin.x+9,origin.y+18);
  }
  function draw(){
    ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.globalAlpha=1;
    if(pose.depth<.00001)grid2D();else grid3D();
    const axisList=pose.depth<.00001?[]:axes();
    const projected=points.map(p=>({...project(p.PC1,p.PC2,p.PC3*pose.depth),cluster:p.cluster})).sort((a,b)=>a.z-b.z);
    allInBounds=true;drawnPointCount=0;lastBounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
    for(const p of projected){
      const depth=clamp((p.z/fitRadius+1)/2,0,1),r=2.45+.35*depth;
      ctx.fillStyle=colors[p.cluster]||colors[0];ctx.globalAlpha=.57+.30*depth;
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();drawnPointCount++;
      lastBounds.minX=Math.min(lastBounds.minX,p.x-r);lastBounds.maxX=Math.max(lastBounds.maxX,p.x+r);lastBounds.minY=Math.min(lastBounds.minY,p.y-r);lastBounds.maxY=Math.max(lastBounds.maxY,p.y+r);
      if(p.x-r<0||p.x+r>W||p.y-r<0||p.y+r>H)allInBounds=false;
    }
    ctx.globalAlpha=1;if(pose.depth<.00001)labels2D();else labels(axisList);drawCount++;
  }
  function updateText(){
    const is3D=view==='3d';
    canvas.dataset.view=view;
    buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pcaView===view)));
    viewLabel.textContent=is3D?'3D coordinate view':'PC1 / PC2 projection';
    const value=((is3D?variance3D:variance2D)*100).toFixed(2).replace(/\.00$/,'');
    varianceNode.innerHTML=(is3D?'All 3 PCs':'PC1 + PC2')+' · <strong>'+value+'%</strong><br>of input variance';
    hint.innerHTML=is3D?'Drag to rotate<br>Wheel to zoom':'2D projection · 80.13%<br>Wheel to zoom';
    document.querySelector('.pca3d-unit-label').textContent=is3D?'PCA scores · equal units':'Equal score units';
    canvas.setAttribute('aria-label',is3D?'Interactive three-dimensional PCA scores for all '+points.length+' non-electric training listings. PC1, PC2 and PC3 use equal dimensionless units. All three components explain 100 percent of the three input features.':'Two-dimensional PC1 and PC2 projection of all '+points.length+' non-electric training listings. Equal dimensionless units; these two components retain 80.13 percent of input variance.');
  }
  function stopTween(finish){if(tween){tween.kill();tween=null;}if(finish&&target)Object.assign(pose,target);target=null;}
  function state(){return{view,orbit:{yaw:pose.yaw,pitch:pose.pitch,zoom:pose.zoom}};}
  function sendState(value){if(channel){channel.postMessage({type:'state',sender,state:value||state()});sent++;}}
  function scheduleDraw(broadcast){pendingBroadcast=pendingBroadcast||Boolean(broadcast);if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;if(active)draw();if(pendingBroadcast)sendState();pendingBroadcast=false;});}
  function applyState(next,animate,broadcast){
    stopTween(false);view=next.view;
    const nextPose={yaw:view==='2d'?0:wrap(next.orbit.yaw),pitch:view==='2d'?0:clamp(next.orbit.pitch,-1.5,1.5),zoom:clamp(next.orbit.zoom,.62,1),depth:view==='2d'?0:1};
    updateText();
    if(animate&&!reduced.matches&&active&&window.gsap){target=nextPose;tween=gsap.to(pose,{...nextPose,duration:.48,ease:'power2.inOut',onUpdate:draw,onComplete(){Object.assign(pose,nextPose);target=null;tween=null;draw();}});}else{Object.assign(pose,nextPose);draw();}
    if(broadcast)sendState({view,orbit:{yaw:nextPose.yaw,pitch:nextPose.pitch,zoom:nextPose.zoom}});
    return diagnostics();
  }
  function setView(mode,options){options=options||{};mode=String(mode).toLowerCase();if(!['2d','3d'].includes(mode))throw new Error('PCA view must be 2d or 3d');return applyState({view:mode,orbit:{...DEFAULT,zoom:mode==='2d'?1:DEFAULT.zoom}},options.animate!==false,options.broadcast===true);}
  function reset(){return applyState({view,orbit:{...DEFAULT,zoom:view==='2d'?1:DEFAULT.zoom}},false,true);}
  function stopDrag(){if(drag&&canvas.hasPointerCapture?.(drag.id))try{canvas.releasePointerCapture(drag.id);}catch{}drag=null;canvas.classList.remove('is-dragging');}
  function cancelWork(){stopDrag();stopTween(true);if(frame!==null){cancelAnimationFrame(frame);frame=null;}pendingBroadcast=false;}
  function activate(detail){active=(detail.id||detail.sceneId)==='pca';if(!active){cancelWork();return;}updateText();draw();if(channel&&audience)channel.postMessage({type:'request',sender});}
  canvas.addEventListener('pointerdown',event=>{event.stopPropagation();if(event.button!==0||view!=='3d')return;event.preventDefault();stopTween(true);drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.classList.add('is-dragging');canvas.focus({preventScroll:true});});
  canvas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;pose.yaw=wrap(pose.yaw+dx*.007);pose.pitch=clamp(pose.pitch+dy*.007,-1.5,1.5);scheduleDraw(true);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(drag&&drag.id===event.pointerId){event.stopPropagation();stopDrag();scheduleDraw(true);}});
  canvas.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();stopTween(true);const zoom=clamp(pose.zoom*Math.exp(-event.deltaY*.0013),.62,1);if(zoom!==pose.zoom){pose.zoom=zoom;scheduleDraw(true);}},{passive:false});
  buttons.forEach(button=>button.addEventListener('click',()=>setView(button.dataset.pcaView,{animate:true,broadcast:true})));
  document.getElementById('pca3d-reset').addEventListener('click',reset);
  window.addEventListener('pilot:willchange',()=>{if(active)cancelWork();});
  window.addEventListener('pilot:scene',event=>activate(event.detail));
  reduced.addEventListener('change',()=>{if(reduced.matches){stopTween(true);draw();}});
  function diagnostics(){const c=camera();return{ready:true,pointCount:points.length,drawnPointCount,view,orbit:{yaw:pose.yaw,pitch:pose.pitch,zoom:pose.zoom},defaultOrbit:{...DEFAULT,zoom:view==='2d'?1:DEFAULT.zoom},allInBounds,uniformScale:c.scale,boundingRadius:radius,fitRadius,planeBounds,planeFitScale:planeScale,viewport:{width:W,height:H,centerX:c.x,centerY:c.y},projectedBounds:lastBounds,variance2D,variance3D,active,drawCount,dragging:Boolean(drag),animationRunning:Boolean(tween&&tween.isActive()),framePending:frame!==null,sync:{supported:Boolean(channel),scope,role:audience?'audience':'presenter',sent,received}};}
  updateText();draw();
  document.fonts?.ready.then(()=>{if(active)draw();});
  window.PCA3D={setView,reset,diagnostics};
  if(live&&typeof BroadcastChannel==='function'){
    try{
      const host=parent!==window?parent:window;
      audience=new URLSearchParams(host.location.search).get('mode')==='audience';
      scope=host.document.querySelector('hyperframes-slideshow')?.getAttribute('notes-storage-key')||host.location.pathname;
      channel=new BroadcastChannel('ml-final:pca3d:'+scope);
      channel.onmessage=event=>{const message=event.data;if(!message||message.sender===sender)return;if(message.type==='request'){if(!audience)sendState();return;}const s=message.state;if(message.type!=='state'||!s||!['3d','2d'].includes(s.view)||!s.orbit||!['yaw','pitch','zoom'].every(k=>Number.isFinite(s.orbit[k])))return;received++;applyState(s,s.view!==view,false);};
      channel.postMessage({type:'request',sender});
    }catch(error){console.warn('PCA view synchronization is unavailable',error);}
  }
})();
