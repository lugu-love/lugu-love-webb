(function () {
  "use strict";

  var manifestUrl = "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/music/catalog/v1/manifest.json";
  var manifestPromise = null;
  var tracks = [];

  function isEligible(track, context) {
    return Boolean(
      track &&
      track.status === "active" &&
      track.license &&
      track.license.status === "verified" &&
      track.contexts &&
      track.contexts[context] === true &&
      typeof track.url === "string" &&
      track.url
    );
  }

  function load(force) {
    if (manifestPromise && !force) return manifestPromise;
    manifestPromise = fetch(manifestUrl, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("music manifest HTTP " + response.status);
        return response.json();
      })
      .then(function (manifest) {
        tracks = Array.isArray(manifest.tracks) ? manifest.tracks : [];
        return tracks;
      })
      .catch(function (error) {
        manifestPromise = null;
        throw error;
      });
    return manifestPromise;
  }

  function getEligible(context) {
    return tracks.filter(function (track) {
      return isEligible(track, context);
    });
  }

  function pick(context, excludeIds) {
    var eligible = getEligible(context);
    if (!eligible.length) return null;
    var excluded = new Set(Array.isArray(excludeIds) ? excludeIds : []);
    var preferred = eligible.filter(function (track) {
      return !excluded.has(track.id);
    });
    var pool = preferred.length ? preferred : eligible;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  window.LuguMusicLibrary = {
    manifestUrl: manifestUrl,
    isEligible: isEligible,
    load: load,
    getEligible: getEligible,
    pick: pick
  };

  load().catch(function () {});
})();
