window.LifeSpaceDefaults = Object.freeze({
  profile: {
    nickname: "我的生命空间",
    quote: "今天，也值得被记住",
    bio: "记录生活，也记录成为自己的过程。",
    avatar: "",
    theme: "quiet-green",
    textColor: "auto"
  },
  homeTheme: {
    backgroundType: "preset",
    backgroundValue: "default",
    title: "欢迎来到我的生命空间",
    description: "记录生活，也记录成为自己的过程。",
    textColor: "warm-white"
  },
  channels: [
    { id: "emotion", name: "我的情感", icon: "heart", description: "收藏心里的感受与关系。" },
    { id: "life", name: "我的生活", icon: "sun", description: "记录平凡却值得留下的时刻。", enabled: true },
    { id: "growth", name: "我的成长", icon: "sprout", description: "看见每一次改变与抵达。" },
    { id: "travel", name: "我的旅行", icon: "compass", description: "留住走过的地方与风景。" },
    { id: "creation", name: "我的创作", icon: "spark", description: "安放灵感、作品与表达。" },
    { id: "collection", name: "我的收藏", icon: "gem", description: "珍藏打动自己的事物。" },
    { id: "life-tree", name: "我的生命树", icon: "tree", description: "让生命经历慢慢长成一棵树。" }
  ],
  cardShape: {
    id: "",
    userId: "local-user",
    channelId: "life",
    title: "",
    subtitle: "",
    content: "",
    images: [],
    imageLayout: "auto",
    visualTemplate: "",
    textPaper: "plain",
    createdAt: "",
    updatedAt: "",
    location: "",
    visibility: "private",
    music: null,
    video: null,
    voice: null,
    tags: [],
    status: "published"
  }
});
