/* Candidate runtime switch (Hotfix A+C). */
window.PRODUCTION_SITE_ENABLED = false;
/* Hotfix C: 视频生成后端。原 api.lugu.love 指向已删除的 Railway 应用；
   现指向重建/恢复后的后端（47.109.185.222, nginx 443 独立路径）。 */
window.LUGU_API_BASE = "https://candidate.suomaanjia.cn/lugu-send";
