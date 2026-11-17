(function () {
  "use strict";
  var ids = ["data", "eda-price", "eda-mileage", "protocol"];
  var data = window.DECK_DATA && window.DECK_DATA.csv;
  var extra = window.EVIDENCE_DATA;
  var active = null, entrance = null;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var NS = "http://www.w3.org/2000/svg";
  // A dedicated left gutter separates vertical quantities/units from tick labels.
  var P = { l: 150, r: 754, t: 27, b: 247 };
  var rest = [];

  function el(name, attributes, content) {
    var node = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, attributes[key]); });
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function add(parent, name, attributes, content) { var n = el(name, attributes, content); parent.appendChild(n); return n; }
  function text(parent, x, y, content, anchor, cls) {
    return add(parent, "text", { x: x, y: y, "text-anchor": anchor || "middle", "class": cls || "ev-tick" }, content);
  }
  function line(parent, x1, y1, x2, y2, cls) { return add(parent, "line", { x1:x1,y1:y1,x2:x2,y2:y2,"class":cls || "ev-gridline" }); }
  function linear(value, min, max, lo, hi) { return lo + (value-min)/(max-min)*(hi-lo); }
  function yAxisTitle(svg, labels) {
    var group=add(svg,"g",{"class":"ev-y-title","transform":"translate(36 "+((P.t+P.b)/2)+") rotate(-90)"});
    labels.forEach(function(label,i){text(group,0,labels.length===1?8:(i?30:0),label,"middle","ev-axis-label");});
  }
  function xAxisTitle(svg, label) {
    text(svg,(P.l+P.r)/2,325,label,"middle","ev-axis-label ev-x-title");
  }
  function axes(svg, yTicks, yScale, xTicks, xScale, xTitle, yTitle) {
    yTicks.forEach(function (v) { var y = yScale(v); line(svg,P.l,y,P.r,y); text(svg,P.l-13,y+9,v,"end"); });
    line(svg,P.l,P.b,P.r,P.b,"ev-axis-line");
    xTicks.forEach(function (v) { var x=xScale(v); line(svg,x,P.b,x,P.b+6,"ev-axis-line"); text(svg,x,P.b+34,v); });
    yAxisTitle(svg,yTitle);
    xAxisTitle(svg,xTitle);
  }
  function revealGroup(svg, name) {
    var defs=add(svg,"defs"), clip=add(defs,"clipPath",{id:name}), rect=add(clip,"rect",{x:P.l-6,y:P.t-8,width:P.r-P.l+12,height:P.b-P.t+16,"class":"ev-reveal-rect"});
    var g=add(svg,"g",{"clip-path":"url(#"+name+")","class":"ev-chart-marks"});
    rect.dataset.evWidth=String(P.r-P.l+12);
    return g;
  }
  function priceChart() {
    var svg=document.getElementById("ev-price-chart"), rows=data.eda_price_bands;
    var y=function(v){return linear(v,0,650,P.b,P.t);};
    [0,200,400,600].forEach(function(v){line(svg,P.l,y(v),P.r,y(v));text(svg,P.l-13,y(v)+9,v,"end");});
    yAxisTitle(svg,["Listings"]);
    line(svg,P.l,P.b,P.r,P.b,"ev-axis-line");
    var marks=revealGroup(svg,"ev-price-clip"), width=(P.r-P.l)/rows.length;
    rows.forEach(function(row,i){var x=P.l+(i+.5)*width,h=P.b-y(row.count);
      add(marks,"rect",{x:x-width*.31,y:y(row.count),width:width*.62,height:h,"class":"ev-bar","data-count":row.count});
      text(svg,x,y(row.count)-10,row.count,"middle","ev-count");
      text(svg,x,P.b+34,row.price_band_million_kzt.replace("-","–"));
    });
    xAxisTitle(svg,"Asking price (million KZT)");
  }
  function yearChart() {
    var svg=document.getElementById("ev-year-chart"), rows=data.eda_year;
    var x=function(v){return linear(v,1990,2025,P.l,P.r);}, y=function(v){return linear(v,0,20,P.b,P.t);};
    axes(svg,[0,5,10,15,20],y,[1990,2000,2010,2020,2025],x,"Model year",["Median price","million KZT"]);
    var marks=revealGroup(svg,"ev-year-clip"), path=rows.map(function(r,i){return(i?"L":"M")+x(r.year)+" "+y(r.median/1e6);}).join(" ");
    add(marks,"path",{d:path,"class":"ev-year-line"});
    rows.forEach(function(r){var p=add(marks,"circle",{cx:x(r.year),cy:y(r.median/1e6),r:3.8,"class":"ev-year-dot","data-year":r.year,"data-price":r.median,"data-n":r.size});add(p,"title",{},r.year+": "+r.median+" KZT; n="+r.size);});
  }
  function mileageChart() {
    var svg=document.getElementById("ev-mileage-chart"), rows=data.eda_mileage_sample;
    var x=function(v){return linear(v,0,1100,P.l,P.r);}, y=function(v){return linear(v,0,170,P.b,P.t);};
    axes(svg,[0,50,100,150],y,[0,250,500,750,1000],x,"Mileage (thousand km)",["Price","million KZT"]);
    var marks=revealGroup(svg,"ev-mileage-clip");
    rows.forEach(function(r){add(marks,"circle",{cx:x(r.mileage_km/1000),cy:y(r.price/1e6),r:2.6,"class":"ev-mileage-dot","data-mileage":r.mileage_km,"data-price":r.price});});
  }
  function fuelChart() {
    var svg=document.getElementById("ev-fuel-chart"), rows=extra.fuel;
    var y=function(v){return linear(Math.log10(v),Math.log10(.3),Math.log10(200),P.b,P.t);};
    // Log tick spacing stays readable at the live player's smaller scale.
    [.5,2,10,50,200].forEach(function(v){line(svg,P.l,y(v),P.r,y(v));text(svg,P.l-13,y(v)+9,v,"end");});
    yAxisTitle(svg,["Price","million KZT"]);
    line(svg,P.l,P.b,P.r,P.b,"ev-axis-line");
    var marks=revealGroup(svg,"ev-fuel-clip"), width=(P.r-P.l)/rows.length;
    rows.forEach(function(r,i){var x=P.l+(i+.5)*width, box=add(marks,"g",{"class":"ev-fuel-group","data-fuel":r.fuel,"data-n":r.n});
      var lo=y(r.whiskerLow/1e6),hi=y(r.whiskerHigh/1e6),q1=y(r.q1/1e6),q3=y(r.q3/1e6),med=y(r.median/1e6);
      line(box,x,hi,x,lo,"ev-box-whisker");line(box,x-13,hi,x+13,hi,"ev-box-cap");line(box,x-13,lo,x+13,lo,"ev-box-cap");
      add(box,"rect",{x:x-28,y:q3,width:56,height:q1-q3,"class":"ev-box"});line(box,x-28,med,x+28,med,"ev-box-median");
      r.fliers.forEach(function(v){add(box,"circle",{cx:x,cy:y(v/1e6),r:2.8,"class":"ev-box-flier","data-price":v});});
      if(r.fuel==="gas_petrol"){text(svg,x,P.b+27,"Gas +","middle","ev-fuel-category");text(svg,x,P.b+54,"petrol","middle","ev-fuel-category");}else{text(svg,x,P.b+31,r.label,"middle","ev-fuel-category");}
      text(svg,x,329,"n="+r.n,"middle","ev-tick-small");
    });
  }
  function animatedNodes(scene) {
    return Array.from(scene.querySelectorAll(".ev-clean-step,.ev-clean-route,.ev-data-limits>div,.ev-figure figcaption,.ev-plot-scope,.ev-count,.ev-interpretations p,.ev-split-part,.ev-split-scale,.ev-protocol-details>div,.ev-protocol-caveat"));
  }
  function remember() {
    ids.forEach(function(id){var scene=document.querySelector('[data-scene-id="'+id+'"]');
      if(!scene)return;
      animatedNodes(scene).forEach(function(n){rest.push({node:n,style:n.getAttribute("style")});});
    });
  }
  function reset() {
    if(entrance){entrance.kill();entrance=null;}
    rest.forEach(function(r){if(r.style===null)r.node.removeAttribute("style");else r.node.setAttribute("style",r.style);});
    document.querySelectorAll(".evidence-scene .ev-reveal-rect").forEach(function(n){n.setAttribute("width",n.dataset.evWidth);});
  }
  function activate(detail) {
    reset();active=ids.indexOf(detail.id)>=0?detail.id:null;
    if(!active || !detail.live || detail.static || reduced.matches || !window.gsap)return;
    var scene=document.querySelector('[data-scene-id="'+active+'"]');
    entrance=window.gsap.timeline({defaults:{ease:"power2.out"}});
    if(active==="data"){
      entrance.from(scene.querySelectorAll(".ev-clean-step"),{autoAlpha:0,y:14,stagger:.2,duration:.65},.22)
        .from(scene.querySelector(".ev-clean-route"),{scaleX:0,transformOrigin:"left center",duration:1},.3)
        .from(scene.querySelectorAll(".ev-data-limits>div"),{autoAlpha:0,y:9,stagger:.12,duration:.65},1.05);
    }else if(active==="protocol"){
      entrance.from(scene.querySelectorAll(".ev-split-part"),{autoAlpha:0,y:12,stagger:.14,duration:.65},.2)
        .from(scene.querySelector(".ev-split-scale"),{scaleX:0,transformOrigin:"left center",duration:.85},.3)
        .from(scene.querySelectorAll(".ev-protocol-details>div"),{autoAlpha:0,y:10,stagger:.13,duration:.65},.8)
        .from(scene.querySelector(".ev-protocol-caveat"),{autoAlpha:0,y:6,duration:.6},1.25);
    }else{
      entrance.from(scene.querySelectorAll(".ev-figure figcaption,.ev-plot-scope"),{autoAlpha:0,y:6,duration:.55,stagger:.05},.12);
      var rects=scene.querySelectorAll(".ev-reveal-rect");
      rects.forEach(function(rect,i){var w=Number(rect.dataset.evWidth);rect.setAttribute("width","0");entrance.to(rect,{attr:{width:w},duration:1.15,ease:"power1.inOut"},.35+i*.14);});
      entrance.from(scene.querySelectorAll(".ev-count"),{autoAlpha:0,duration:.5,stagger:.05},.65)
        .from(scene.querySelectorAll(".ev-interpretations p"),{autoAlpha:0,y:7,duration:.65,stagger:.14},1.22);
    }
  }
  function diagnostics() {
    return {ready:!!(data&&extra),activeId:active,entranceRunning:!!(entrance&&entrance.isActive()),reducedMotion:reduced.matches,
      priceBands:document.querySelectorAll("#ev-price-chart .ev-bar").length,
      yearPoints:document.querySelectorAll("#ev-year-chart .ev-year-dot").length,
      mileagePoints:document.querySelectorAll("#ev-mileage-chart .ev-mileage-dot").length,
      fuelGroups:document.querySelectorAll("#ev-fuel-chart .ev-fuel-group").length,
      fuelOutliers:document.querySelectorAll("#ev-fuel-chart .ev-box-flier").length,
      sourceFuelRows:extra?extra.fuel.reduce(function(n,r){return n+r.n;},0):0,
      mileageDomain:{xThousandKm:[0,1100],yMillionKZT:[0,170]},fuelMillionKZTDomain:[.3,200]};
  }
  window.EVIDENCE={activate:activate,reset:reset,diagnostics:diagnostics};
  if(!data||!extra){console.error("Evidence sources missing: load deck-data.js and evidence-data.js before evidence.js");return;}
  priceChart();yearChart();mileageChart();fuelChart();remember();
  window.addEventListener("pilot:scene",function(event){activate(event.detail||{});});
  reduced.addEventListener("change",function(){if(reduced.matches)reset();});
})();
