(function () {
  "use strict";

  window.LifeSpaceDemoVisitors = Object.freeze({
    "demo-lugu": Object.freeze({
      id: "demo-lugu",
      heartStarId: "LX-DEMO-000001",
      nickname: "泸沽湖畔的阿夏",
      quote: "愿每一次相遇，都像湖面的晨光。",
      bio: "生活在泸沽湖边，喜欢记录清晨、家人和四季。",
      avatar: "assets/demo/demo-avatar.png",
      theme: "quiet-green",
      textColor: "warm-white",
      cards: Object.freeze([
        {
          id: "demo-life-001",
          channelId: "life",
          title: "湖边的清晨",
          subtitle: "太阳从格姆女神山后慢慢升起",
          content: "天刚亮的时候，我沿着湖边走了一圈。水面很安静，远处传来划船的声音。这样的清晨，总让我觉得新的一天值得期待。",
          images: [{ src: "assets/demo/lugu-lake.webp", positionX: 50, positionY: 38 }],
          imageLayout: "hero",
          imageLayoutCount: 1,
          templateId: "a",
          visualTemplate: "a",
          textPaper: "cream-lines",
          createdAt: "2026-07-18T06:40:00+08:00",
          tags: ["清晨", "泸沽湖"],
          visibility: "public",
          status: "published"
        },
        {
          id: "demo-life-002",
          channelId: "life",
          title: "和家人一起吃晚饭",
          subtitle: "普通的一顿饭，也是值得留下的时刻",
          content: "今天大家难得都在家。火塘边很暖，我们聊了许多小时候的事情。没有特别的安排，却是我很想收藏的一晚。",
          images: [
            { src: "assets/demo/lugu-lake.webp", positionX: 24, positionY: 56 },
            { src: "assets/demo/lugu-lake.webp", positionX: 76, positionY: 44 }
          ],
          imageLayout: "grid",
          imageLayoutCount: 2,
          templateId: "b",
          visualTemplate: "b",
          textPaper: "kraft",
          createdAt: "2026-07-20T19:20:00+08:00",
          tags: ["家人", "晚餐"],
          visibility: "public",
          status: "published"
        },
        {
          id: "demo-life-003",
          channelId: "life",
          title: "雨后的村庄",
          subtitle: "屋檐滴水，空气里都是青草的味道",
          content: "午后的雨停了，云雾还留在山腰。孩子们跑到院子里踩水，我拿起相机记录了这一刻。",
          images: [
            { src: "assets/demo/lugu-lake.webp", positionX: 50, positionY: 50 },
            { src: "assets/demo/lugu-lake.webp", positionX: 18, positionY: 68 },
            { src: "assets/demo/lugu-lake.webp", positionX: 84, positionY: 34 }
          ],
          imageLayout: "hero-2",
          imageLayoutCount: 3,
          templateId: "c",
          visualTemplate: "c",
          textPaper: "leaf",
          createdAt: "2026-07-23T16:10:00+08:00",
          tags: ["雨天", "村庄"],
          visibility: "public",
          status: "published"
        }
      ])
    }),
    "demo-city": Object.freeze({
      id: "demo-city",
      heartStarId: "LX-DEMO-000002",
      nickname: "晚风里的小满",
      quote: "把匆忙的日子，过成自己喜欢的节奏。",
      bio: "住在城市里，也认真收集每一盏为自己亮起的灯。",
      avatar: "assets/demo/demo-avatar.png",
      theme: "night",
      textColor: "warm-white",
      cards: Object.freeze([
        { id: "city-001", channelId: "life", title: "下班路上的风", subtitle: "地铁出口的那一阵晚风", content: "今天没有急着赶路。我在路口停了一会儿，看到天色从橙色慢慢变成深蓝，忽然觉得自己也可以慢一点。", images: [{ src: "assets/demo/lugu-lake.webp", positionX: 64, positionY: 50 }], imageLayout: "hero", imageLayoutCount: 1, templateId: "a", visualTemplate: "a", textPaper: "plain", createdAt: "2026-08-01T19:12:00+08:00", tags: ["城市", "晚风"], visibility: "public", status: "published" },
        { id: "city-002", channelId: "growth", title: "今天没有勉强自己", subtitle: "拒绝一件不适合的事", content: "以前总怕让人失望。今天我练习把真实的感受说出来，发现边界不是冷漠，而是好好照顾自己。", images: [], imageLayout: "auto", templateId: "b", visualTemplate: "b", textPaper: "cream-lines", createdAt: "2026-08-03T21:10:00+08:00", tags: ["成长", "边界"], visibility: "public", status: "published" }
      ])
    }),
    "demo-mountain": Object.freeze({
      id: "demo-mountain",
      heartStarId: "LX-DEMO-000003",
      nickname: "山里的一页信",
      quote: "慢一点，才能听见心里的回声。",
      bio: "喜欢山路、植物和没有被安排好的下午。",
      avatar: "assets/demo/demo-avatar.png",
      theme: "quiet-green",
      textColor: "warm-white",
      cards: Object.freeze([
        { id: "mountain-001", channelId: "travel", title: "雾起的时候", subtitle: "山在云里，心也安静下来", content: "沿着湿润的小路往上走，树叶在鞋边轻轻响。看不见远方也没关系，眼前这一段路已经足够美。", images: [{ src: "assets/demo/lugu-lake.webp", positionX: 35, positionY: 42 }], imageLayout: "hero", imageLayoutCount: 1, templateId: "c", visualTemplate: "c", textPaper: "leaf", createdAt: "2026-08-04T09:30:00+08:00", tags: ["山野", "旅行"], visibility: "public", status: "published" },
        { id: "mountain-002", channelId: "emotion", title: "允许今天慢一点", subtitle: "不急着给自己答案", content: "我决定把焦虑先放在一边，去晒一会儿太阳。很多答案不是想出来的，是在好好生活以后自己出现的。", images: [], imageLayout: "auto", templateId: "a", visualTemplate: "a", textPaper: "plain", createdAt: "2026-08-05T14:20:00+08:00", tags: ["情绪", "松弛"], visibility: "public", status: "published" }
      ])
    }),
    "demo-studio": Object.freeze({
      id: "demo-studio",
      heartStarId: "LX-DEMO-000004",
      nickname: "把灵感装进口袋",
      quote: "所有认真发光的瞬间，都值得被收藏。",
      bio: "一个正在学习表达的人，把零碎灵感慢慢做成作品。",
      avatar: "assets/demo/demo-avatar.png",
      theme: "aurora",
      textColor: "warm-white",
      cards: Object.freeze([
        { id: "studio-001", channelId: "creation", title: "一张还没完成的草图", subtitle: "先让想法有一个形状", content: "它还不完美，线条也有点乱。但我想先把它留下来，提醒自己：所有作品，都是从一个不确定的开始长出来的。", images: [{ src: "assets/demo/lugu-lake.webp", positionX: 50, positionY: 50 }], imageLayout: "hero", imageLayoutCount: 1, templateId: "b", visualTemplate: "b", textPaper: "kraft", createdAt: "2026-08-06T22:08:00+08:00", tags: ["创作", "灵感"], visibility: "public", status: "published" },
        { id: "studio-002", channelId: "collection", title: "今天收集到的三句话", subtitle: "它们像小小的路标", content: "“慢一点也没关系。” “你已经做得很好了。” “继续好奇。” 我把它们记在这里，等未来的自己回来翻看。", images: [], imageLayout: "auto", templateId: "c", visualTemplate: "c", textPaper: "cream-lines", createdAt: "2026-08-07T18:40:00+08:00", tags: ["收藏", "文字"], visibility: "public", status: "published" }
      ])
    })
  });
})();
