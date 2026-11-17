/* Standalone HyperFrames adapter: native controls seek a paused timeline;
 * finite live entrances run independently and leave each slide at rest.
 * Raw composition URLs and goto(..., {animate:false}) are deterministic. */
(function () {
  "use strict";
  var manifest = JSON.parse(document.getElementById("pilot-scene-manifest").textContent);
  var liveEnabled = new URLSearchParams(location.search).get("live") === "1";
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var sceneElements = manifest.map(function (scene) {
    return document.querySelector('[data-scene-id="' + scene.sceneId + '"]');
  });
  var originalStyles = new WeakMap();
  var originalTransforms = new WeakMap();
  var activeIndex = -1;
  var entrance = null;
  var transitionSerial = 0;
  var transitionCount = 0;
  var lastActivation = { live: false, static: true };
  var lastAnimationState = "rest";
  var root;
  var coverFilm = document.getElementById("cover-film");
  var coverHold = null;
  var coverLoop = null;
  var coverHoldEpoch = 0;
  var coverHolding = false;
  // Native iframe key forwarding remains responsible for slide navigation.
  // Keep Space's ordinary activation behavior when an actual control has focus.
  document.addEventListener("keydown", function (event) {
    if (event.key !== " " && event.code !== "Space") return;
    var target = event.target;
    if (target && target.closest && target.closest("button,a,input,textarea,select,[role=button],[contenteditable=true]")) event.stopPropagation();
  }, true);
  var totalDuration = Math.max.apply(null, manifest.map(function (s) { return s.start + s.duration; }));
  var animationSelector = "[data-anim], [data-stage], .plot-mark, .chart-axis, .axis, [data-chart-axis]";
  var allAnimated = Array.from(document.querySelectorAll(animationSelector));
  allAnimated.forEach(function (el) {
    originalStyles.set(el, el.getAttribute("style"));
    originalTransforms.set(el, el.getAttribute("transform"));
  });

  // Preserve the approved intro's parked ending without advancing the deck.
  // The native slideshow starts/stops the primary intro. This idle adapter
  // mirrors the earlier approved preview: local lamp loop plus crisp text.
  function prepareCoverHold() {
    if (!coverFilm || !sceneElements[0]) return;
    coverHold = document.createElement("div");
    coverHold.id = "pilot-cover-hold";
    coverHold.hidden = true;
    coverHold.style.cssText = "position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden";
    coverLoop = document.createElement("video");
    coverLoop.id = "pilot-cover-lamps";
    coverLoop.src = "../assets/car/parked-loop.mp4";
    coverLoop.muted = true;
    coverLoop.defaultMuted = true;
    coverLoop.playsInline = true;
    coverLoop.loop = true;
    coverLoop.preload = "auto";
    coverLoop.setAttribute("aria-hidden", "true");
    coverLoop.style.cssText = "position:absolute;inset:0;width:1920px;height:1080px;object-fit:cover";
    // The native media channel also starts this element in an audience window.
    // Reveal from its play event: a remotely paused intro may never emit ended.
    coverLoop.addEventListener("play", function () {
      if (activeIndex === 0 && liveEnabled) {
        coverHolding = true;
        coverHold.hidden = false;
      }
    });
    var copy = document.createElement("div");
    copy.style.cssText = "position:absolute;left:128px;top:236px;width:760px;color:#f6f8f9;font-family:Manrope,sans-serif";
    copy.innerHTML = '<p style="margin:0 0 28px;font-family:Barlow,sans-serif;font-size:19px;font-weight:600;letter-spacing:.13em;line-height:1.4;text-transform:uppercase;color:#e1e8eb">Final course project</p>' +
      '<h1 style="margin:0;width:760px;font-size:100px;font-weight:650;letter-spacing:-4.5px;line-height:1.04;text-wrap:balance;color:#f8fafb">Predicting used-car prices</h1>' +
      '<p style="margin:31px 0 0;max-width:700px;font-size:27px;font-weight:450;letter-spacing:-.3px;line-height:1.45;color:#f0f4f7">Machine learning on Kazakhstan listings</p>' +
      '<p style="margin:18px 0 0;width:700px;font-size:24px;font-weight:500;letter-spacing:-.15px;line-height:1.4;color:#f0f4f7">Alisher Akhmet · Aslan Muratov</p>';
    coverHold.append(coverLoop, copy);
    sceneElements[0].appendChild(coverHold);
    coverFilm.addEventListener("ended", startCoverHold);
  }

  function stopCoverHold() {
    coverHoldEpoch += 1;
    coverHolding = false;
    if (coverLoop) coverLoop.pause();
    if (coverHold) coverHold.hidden = true;
  }

  function startCoverHold() {
    if (!coverLoop || activeIndex !== 0 || !liveEnabled) return;
    var epoch = ++coverHoldEpoch;
    coverLoop.currentTime = 0;
    coverLoop.play().then(function () {
      if (epoch !== coverHoldEpoch || activeIndex !== 0) { coverLoop.pause(); return; }
      coverHolding = true;
      coverHold.hidden = false;
    }).catch(function (error) {
      console.warn("Parked lamp loop unavailable; retaining the final intro frame", error);
    });
  }

  function restoreElement(el) {
    var style = originalStyles.get(el);
    if (style == null) el.removeAttribute("style");
    else el.setAttribute("style", style);
    var transform = originalTransforms.get(el);
    if (transform == null) el.removeAttribute("transform");
    else el.setAttribute("transform", transform);
    if (el._gsap) el._gsap.uncache = 1;
  }

  function restoreScene(el) {
    if (!el) return;
    var targets = Array.from(el.querySelectorAll(animationSelector));
    gsap.killTweensOf(targets);
    targets.forEach(restoreElement);
  }

  function stopEntrance() {
    transitionSerial += 1;
    if (entrance) { entrance.kill(); entrance = null; }
  }

  function animateScene(el) {
    var serial = transitionSerial;
    var groups = Array.from(el.querySelectorAll("[data-anim]")).filter(function (node) { return node.getAttribute("data-anim") !== "none"; });
    var stages = Array.from(el.querySelectorAll("[data-stage]")).filter(function (node) { return !node.matches("[data-anim]") && !node.closest('[data-anim="none"]'); });
    var marks = Array.from(el.querySelectorAll(".plot-mark")).filter(function (mark) {
      return !mark.matches("[data-anim]");
    });
    var tl = gsap.timeline({ onComplete: function () {
      if (serial !== transitionSerial) return;
      restoreScene(el);
      entrance = null;
      lastAnimationState = "complete";
    } });
    var titles = [], labels = [], annotations = [], body = [], namedAxes = [];
    groups.forEach(function (node) {
      var kind = node.getAttribute("data-anim");
      if (kind === "axes") namedAxes.push(node);
      else if (kind === "title" || node.matches("h1,h2,h3,.cover-copy") || node.querySelector("h1,h2")) titles.push(node);
      else if (kind === "label" || node.matches(".feature-label")) labels.push(node);
      else if (kind === "annotation" || node.matches(".annotation,.chart-note,.illustration-note")) annotations.push(node);
      else body.push(node);
    });
    if (titles.length) tl.from(titles, { opacity: 0, x: 26, duration: 0.72, stagger: 0.06, ease: "power3.out", overwrite: "auto", immediateRender: true }, 0);
    if (body.length) tl.from(body, { opacity: 0, duration: 0.58, stagger: 0.045, ease: "power1.out", overwrite: "auto", immediateRender: true }, 0.10);
    var axes = namedAxes.concat(Array.from(el.querySelectorAll(".chart-axis,.axis,[data-chart-axis]")).filter(function (axis) { return !axis.matches("[data-anim]"); }));
    if (axes.length) tl.from(axes, { opacity: 0, duration: 0.28, ease: "none", overwrite: "auto", immediateRender: true }, 0.12);
    if (labels.length) tl.from(labels, { opacity: 0, x: -18, duration: 0.44, stagger: 0.09, ease: "power2.out", overwrite: "auto", immediateRender: true }, 0.34);
    var markStagger = Math.min(0.026, 0.38 / Math.max(1, marks.length));
    marks.forEach(function (mark, i) {
      var at = 0.27 + i * markStagger;
      var tag = mark.tagName.toLowerCase();
      if (tag === "rect") {
        var peers = mark.ownerSVGElement ? Array.from(mark.ownerSVGElement.querySelectorAll("rect.plot-mark")) : [mark];
        var horizontal = peers.length > 1 && peers.every(function (peer) { return peer.getAttribute("x") === mark.getAttribute("x"); });
        var barStart = { opacity: 0.25, transformOrigin: horizontal ? "0% 50%" : "50% 100%", duration: 0.53, ease: "power2.out", overwrite: "auto", immediateRender: true };
        barStart[horizontal ? "scaleX" : "scaleY"] = 0.015;
        tl.from(mark, barStart, at);
      } else if ((tag === "path" || tag === "polyline" || tag === "line") && typeof mark.getTotalLength === "function" && getComputedStyle(mark).stroke !== "none") {
        var length = mark.getTotalLength();
        if (Number.isFinite(length) && length > 0) {
          tl.fromTo(mark, { opacity: 0.65, strokeDasharray: length, strokeDashoffset: length }, { opacity: 1, strokeDashoffset: 0, duration: 0.55, ease: "power1.inOut", overwrite: "auto", immediateRender: true }, at);
        } else tl.from(mark, { opacity: 0, duration: 0.42, overwrite: "auto", immediateRender: true }, at);
      } else if (tag === "circle" || tag === "ellipse") {
        tl.from(mark, { opacity: 0, scale: 0.55, transformOrigin: "50% 50%", duration: 0.32, ease: "power2.out", overwrite: "auto", immediateRender: true }, at);
      } else {
        tl.from(mark, { opacity: 0, duration: 0.44, ease: "power1.out", overwrite: "auto", immediateRender: true }, at);
      }
    });
    if (annotations.length) tl.from(annotations, { opacity: 0, y: 10, duration: 0.40, stagger: 0.06, ease: "power1.out", overwrite: "auto", immediateRender: true }, marks.length ? 0.78 : 0.52);
    stages.forEach(function (stage, i) {
      var stageNumber = Number(stage.getAttribute("data-stage"));
      var at = 0.14 + (Number.isFinite(stageNumber) ? Math.max(0, stageNumber) : i) * 0.16;
      tl.from(stage, {opacity:0, y:12, duration:0.6, ease:"power2.out", overwrite:"auto", immediateRender:true}, at);
    });
    if (tl.duration() === 0) { tl.kill(); lastAnimationState = "complete"; }
    else { entrance = tl; lastAnimationState = "running"; }
  }

  function sceneAtTime(time) {
    var t = Math.max(0, Math.min(totalDuration - 0.0001, Number(time) || 0));
    for (var i = 0; i < manifest.length; i += 1) {
      if (t >= manifest[i].start && t < manifest[i].start + manifest[i].duration) return i;
    }
    return manifest.length - 1;
  }

  function applyScene(index, options) {
    options = options || {};
    index = Math.max(0, Math.min(manifest.length - 1, Math.trunc(Number(index) || 0)));
    var previousIndex = activeIndex;
    var previousId = manifest[previousIndex] ? manifest[previousIndex].sceneId : null;
    var changed = activeIndex !== index;
    var animate = Boolean(options.animate && !reducedMotion.matches);
    if (!changed && !options.force) return currentState();
    window.dispatchEvent(new CustomEvent("pilot:willchange", {detail:{id:manifest[index].sceneId,index:index,previousId:previousId,previousIndex:previousIndex,changed:changed,live:animate,static:!animate,direction:previousIndex<index?"forward":"back"}}));
    stopEntrance();
    if (changed) stopCoverHold();
    if (activeIndex >= 0) restoreScene(sceneElements[activeIndex]);
    sceneElements.forEach(function (el, i) {
      if (!el) return;
      var active = i === index;
      el.dataset.active = active ? "true" : "false";
      el.style.opacity = active ? "1" : "0";
      el.style.visibility = active ? "visible" : "hidden";
      el.style.pointerEvents = active ? "auto" : "none";
      el.setAttribute("aria-hidden", active ? "false" : "true");
    });
    activeIndex = index;
    document.body.dataset.scene = manifest[index].sceneId;
    document.body.dataset.sceneIndex = String(index);
    document.body.dataset.previousScene = previousId || "";
    restoreScene(sceneElements[index]);
    transitionCount += 1;
    var detail = { id: manifest[index].sceneId, sceneId: manifest[index].sceneId, index: index, previousId: previousId, previousIndex: previousIndex, direction: previousIndex < 0 ? "initial" : index > previousIndex ? "forward" : index < previousIndex ? "back" : "same", transition: previousId === "cover" && manifest[index].sceneId === "question" ? "enter-cockpit" : "hud", live: animate, static: !animate };
    lastActivation = detail;
    lastAnimationState = animate ? "starting" : "rest";
    window.dispatchEvent(new CustomEvent("pilot:scene", { detail: detail }));
    if (animate && sceneElements[index]) animateScene(sceneElements[index]);
    return currentState();
  }

  function currentState() {
    return { id: manifest[activeIndex] ? manifest[activeIndex].sceneId : null,
      index: activeIndex, live: lastActivation.live, static: lastActivation.static, reducedMotion: reducedMotion.matches,
      time: root ? root.time() : 0, paused: root ? root.paused() : true };
  }

  function goto(index, options) {
    options = options || {};
    index = Math.max(0, Math.min(manifest.length - 1, Math.trunc(Number(index) || 0)));
    var scene = manifest[index];
    root.seek(scene.start + scene.duration / 2, true).pause();
    return applyScene(index, { animate: options.animate === true, force: true });
  }

  function postTimeline() {
    parent.postMessage({
      source: "hf-preview", type: "timeline", durationInFrames: totalDuration * 30,
      durationSeconds: totalDuration, compositionWidth: 1920, compositionHeight: 1080,
      assetsReady: true,
      scenes: manifest.map(function (s) { return { id: s.sceneId, start: s.start, duration: s.duration }; })
    }, "*");
  }

  window.__timelines = window.__timelines || {};
  root = gsap.timeline({ paused: true });
  root.to({}, { duration: totalDuration });
  root.eventCallback("onUpdate", function () {
    applyScene(sceneAtTime(root.time()), { animate: liveEnabled });
  });
  window.__timelines.root = root;
  window.__hfSetTime = function (time, options) {
    options = options || {};
    root.seek(time, true).pause();
    return applyScene(sceneAtTime(time), { animate: options.animate === true, force: true });
  };
  window.PILOT_RUNTIME = {
    goto: goto, current: currentState, manifest: manifest,
    ready: true,
    readyPromise: Promise.resolve(),
    get currentIndex() { return activeIndex; },
    get currentId() { return manifest[activeIndex] ? manifest[activeIndex].sceneId : null; },
    diagnostics: function () {
      var state = currentState();
      return { currentIndex: state.index, currentId: state.id, activeIndex: state.index, activeId: state.id, time: state.time,
        rootPaused: state.paused, liveEnabled: liveEnabled, reducedMotion: reducedMotion.matches,
        sceneCount: sceneElements.length, missingScenes: manifest.filter(function (_, i) { return !sceneElements[i]; }).map(function (s) { return s.sceneId; }),
        transitionCount: transitionCount, entranceRunning: Boolean(entrance && entrance.isActive()), lastAnimationState: lastAnimationState,
        coverHolding: coverHolding, coverTime: coverFilm ? coverFilm.currentTime : null,
        coverPaused: coverFilm ? coverFilm.paused : null,
        lampTime: coverLoop ? coverLoop.currentTime : null,
        lampsPaused: coverLoop ? coverLoop.paused : null,
        duration: totalDuration, ready: true };
    }
  };
  prepareCoverHold();
  applyScene(0, { animate: liveEnabled, force: true });
  window.__pilotReady = true;
  window.__deckReady = true;
  document.documentElement.dataset.deckReady = "true";
  window.dispatchEvent(new CustomEvent("pilot:ready", { detail: currentState() }));
  if (document.readyState === "complete") postTimeline();
  else window.addEventListener("load", postTimeline, { once: true });
  // A second bootstrap after the iframe load event survives player lifecycle resets.
  setTimeout(postTimeline, 300);
  reducedMotion.addEventListener("change", function () {
    if (reducedMotion.matches) applyScene(activeIndex, { animate: false, force: true });
  });
})();
