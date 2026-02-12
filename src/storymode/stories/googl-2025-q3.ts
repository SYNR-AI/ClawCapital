export interface Checkpoint {
  id: string;
  date: string;
  label: string;
  price: number;
  narrative: string;
  revealAfterAction: string;
}

export interface Story {
  id: string;
  title: string;
  ticker: string;
  startingCash: number;
  checkpoints: Checkpoint[];
}

export const GOOGL_2025_Q3: Story = {
  id: "googl-2025-q3-earnings",
  title: "Google 2025 Q3 财报风暴",
  ticker: "GOOGL",
  startingCash: 100_000,
  checkpoints: [
    {
      id: "t-7",
      date: "2025-10-22",
      label: "财报周 — 一周前",
      price: 170.0,
      narrative:
        "市场传闻 Google Cloud 增速放缓。华尔街对 AI 变现进展存疑。\n分析师一致预期 EPS $1.85，营收 $862 亿。GOOGL 过去一个月横盘。",
      revealAfterAction: "接下来几天，多家投行上调目标价至 $190+。",
    },
    {
      id: "t-1",
      date: "2025-10-28",
      label: "财报前一天",
      price: 175.5,
      narrative:
        "盘后微软财报超预期，Azure 增速 35%。市场预期 Google Cloud 也将受益。\n期权市场隐含波动率飙升至 45%，反映财报日大幅波动预期。\nGOOGL 尾盘拉升 2%。",
      revealAfterAction: "财报将在明天盘后发布。",
    },
    {
      id: "t0",
      date: "2025-10-29",
      label: "财报日",
      price: 178.0,
      narrative:
        "盘后发布：EPS $2.12 (beat +14%), 营收 $889亿 (beat +3%)。\nGoogle Cloud 营收 $112 亿，增速 28%，略低于预期的 30%。\nYouTube 广告收入创新高 $95 亿。Waymo 首次单独披露营收。\n盘后股价先涨 5% 后回落至 +2%，市场对 Cloud 增速不满意。",
      revealAfterAction: "次日开盘将出现剧烈波动，最终方向取决于分析师解读。",
    },
    {
      id: "t1",
      date: "2025-10-30",
      label: "财报后第一天",
      price: 174.0,
      narrative:
        "高开低走。开盘 $182 后持续走低，收跌 2.2%。\n多家机构下调评级，认为 Cloud 增速见顶。散户逢高出货。\n市场整体承压，科技板块普跌。",
      revealAfterAction: "短期修正后，AI 叙事将在接下来几周重新主导市场。",
    },
    {
      id: "t-plus-3m",
      date: "2026-01-29",
      label: "三个月后",
      price: 192.0,
      narrative:
        "GOOGL 从财报后低点反弹 10%+。Gemini 2.0 发布，AI 搜索市占率提升。\nQ4 财报预期强劲。市场重新追捧 AI 龙头。",
      revealAfterAction: "故事结束。来看看你的成绩单。",
    },
  ],
};

export const ALL_STORIES: Story[] = [GOOGL_2025_Q3];
