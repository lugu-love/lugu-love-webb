/* Candidate runtime switch (Hotfix A+C). */
window.PRODUCTION_SITE_ENABLED = false;
/* Hotfix C: 视频生成后端。
   原 api.lugu.love 指向已删除的 Railway 应用。
   现按同源推导（页面与 /lugu-send/ 部署在同一 origin），
   因此 http/https、以及换任何可达域名都无需再改前端。 */
window.LUGU_API_BASE = location.protocol + "//" + location.host + "/lugu-send";
