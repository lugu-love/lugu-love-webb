(function () {
  "use strict";
  if (window.LuguMusic) return;
  var instanceId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  var owners = new Map();
  var activeOwner = "";
  var channel = null;
  try {
    if ("BroadcastChannel" in window) channel = new BroadcastChannel("lugu-exclusive-music-v1");
  } catch (error) {
    channel = null;
  }
  function stopOtherOwners(exceptOwner) {
    owners.forEach(function (stop, owner) {
      if (owner === exceptOwner) return;
      try { stop(); } catch (error) {}
    });
  }
  function claim(owner) {
    if (!owner) return;
    stopOtherOwners(owner);
    activeOwner = owner;
    if (channel) channel.postMessage({ type: "claim", instanceId: instanceId, owner: owner });
    try {
      localStorage.setItem("lugu_music_claim", JSON.stringify({ instanceId: instanceId, owner: owner, time: Date.now() }));
    } catch (error) {}
  }
  function register(owner, stop) {
    if (!owner || typeof stop !== "function") return function () {};
    owners.set(owner, stop);
    return function () { owners.delete(owner); if (activeOwner === owner) activeOwner = ""; };
  }
  function release(owner) { if (activeOwner === owner) activeOwner = ""; }
  if (channel) {
    channel.addEventListener("message", function (event) {
      var data = event.data || {};
      if (data.type !== "claim" || data.instanceId === instanceId) return;
      stopOtherOwners("");
      activeOwner = "";
    });
  }
  window.addEventListener("storage", function (event) {
    if (event.key !== "lugu_music_claim" || !event.newValue) return;
    try {
      var data = JSON.parse(event.newValue);
      if (data.instanceId === instanceId) return;
      stopOtherOwners("");
      activeOwner = "";
    } catch (error) {}
  });
  register("page-media", function () {
    document.querySelectorAll("audio, video").forEach(function (media) {
      if (!media.paused) media.pause();
    });
  });
  document.addEventListener("play", function (event) {
    if (!(event.target instanceof HTMLMediaElement)) return;
    if (!event.target.isConnected) return;
    claim("page-media");
    document.querySelectorAll("audio, video").forEach(function (media) {
      if (media !== event.target && !media.paused) media.pause();
    });
  }, true);
  window.addEventListener("pagehide", function () { stopOtherOwners(""); if (channel) channel.close(); });
  window.LuguMusic = { claim: claim, register: register, release: release };
})();
