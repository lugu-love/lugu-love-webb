/* Frontstage Player V1 — 角色/情绪 registry
 * 所有角色只能通过这里接入；严禁在 player.js 里出现角色专属 if。
 * 第一阶段只接一个：风信兔 · 开心。
 */
(function (global) {
  'use strict';

  var ASSET_ROOT = '../release-20260920-nuanshan-bear-r1/assets/video/fengxin-rabbit-sequence/mobile/';

  var items = {
    'rabbit-happy': {
      itemId: 'rabbit-happy',
      characterId: 'fengxin-rabbit',
      emotionId: 'happy',
      label: '开心',
      assetBase: ASSET_ROOT + '1/',
      poster: ASSET_ROOT + '1/poster.webp',
      sheets: 15,
      frames: 180,
      framesPerSheet: 12,
      gridCols: 4,
      frameSize: 270,
      fps: 24
    }
  };

  var characters = {
    'fengxin-rabbit': { characterId: 'fengxin-rabbit', displayName: '风信兔', itemOrder: ['rabbit-happy'] }
  };

  global.FrontstageRegistryV1 = { characters: characters, items: items, assetRoot: ASSET_ROOT };
})(window);
