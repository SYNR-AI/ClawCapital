# Story Mode — 历史剧情模拟炒股

> 用户穿越回历史上某个关键事件节点，在真实的市场剧情中做交易决策，体验"如果当时我这样操作…"的推演。

---

## 核心概念

- **Story**：一个完整的剧情剧本，围绕某支股票的一个关键事件（如财报、重大新闻）
- **Checkpoint**：剧情中的一个时间节点，包含新闻/事件描述 + 真实历史价格
- **Action**：用户在每个 Checkpoint 可以执行的操作（交易 or 跳过）
- **Scorecard**：故事结束后的复盘总结（P&L、vs 买入持有、vs 真实市场）

---

## 数据结构

```typescript
interface Story {
  id: string; // "googl-2025-q3-earnings"
  title: string; // "Google 2025 Q3 财报风暴"
  ticker: string; // "GOOGL"
  startingCash: number; // 故事初始资金，如 100_000
  checkpoints: Checkpoint[];
}

interface Checkpoint {
  id: string; // "t-minus-1"
  date: string; // "2025-10-27" — 真实历史日期
  label: string; // "财报前一天"
  price: number; // 当日真实收盘价
  narrative: string; // 剧情文本（新闻、市场情绪、分析师观点）
  revealAfterAction: string; // 操作后才显示的"后续发展"提示
}
```

---

## 示例故事：Google 2025 Q3 财报

> 以下为示意结构，价格/日期为占位，实际数据需查实填入。

```yaml
id: googl-2025-q3-earnings
title: "Google 2025 Q3 财报风暴"
ticker: GOOGL
startingCash: 100000

checkpoints:
  - id: t-7
    date: "2025-10-22"
    label: "财报周 — 一周前"
    price: 170.00
    narrative: |
      市场传闻 Google Cloud 增速放缓。华尔街对 AI 变现进展存疑。
      分析师一致预期 EPS $1.85，营收 $862 亿。GOOGL 过去一个月横盘。
    revealAfterAction: "接下来几天，多家投行上调目标价至 $190+。"

  - id: t-1
    date: "2025-10-28"
    label: "财报前一天"
    price: 175.50
    narrative: |
      盘后微软财报超预期，Azure 增速 35%。市场预期 Google Cloud 也将受益。
      期权市场隐含波动率飙升至 45%，反映财报日大幅波动预期。
      GOOGL 尾盘拉升 2%。
    revealAfterAction: "财报将在明天盘后发布。"

  - id: t0
    date: "2025-10-29"
    label: "财报日"
    price: 178.00
    narrative: |
      盘后发布：EPS $2.12 (beat +14%), 营收 $889亿 (beat +3%)。
      Google Cloud 营收 $112 亿，增速 28%，略低于预期的 30%。
      YouTube 广告收入创新高 $95 亿。Waymo 首次单独披露营收。
      盘后股价先涨 5% 后回落至 +2%，市场对 Cloud 增速不满意。
    revealAfterAction: "次日开盘将出现剧烈波动，最终方向取决于分析师解读。"

  - id: t1
    date: "2025-10-30"
    label: "财报后第一天"
    price: 174.00
    narrative: |
      高开低走。开盘 $182 后持续走低，收跌 2.2%。
      多家机构下调评级，认为 Cloud 增速见顶。散户逢高出货。
      市场整体承压，科技板块普跌。
    revealAfterAction: "短期修正后，AI 叙事将在接下来几周重新主导市场。"

  - id: t-plus-3m
    date: "2026-01-29"
    label: "三个月后"
    price: 192.00
    narrative: |
      GOOGL 从财报后低点反弹 10%+。Gemini 2.0 发布，AI 搜索市占率提升。
      Q4 财报预期强劲。市场重新追捧 AI 龙头。
    revealAfterAction: "故事结束。来看看你的成绩单。"
```

---

## 游戏流程

```
开始故事
  → Agent 介绍背景 + 初始资金
  → 进入 Checkpoint[0]

每个 Checkpoint:
  1. Agent 展示日期、价格、剧情叙述
  2. 用户选择操作:
     - 买入 N 股 / 卖出 N 股 / 全仓买入 / 全仓卖出
     - 跳过（不操作）
  3. 使用 story_action 工具执行交易（以 checkpoint.price 成交）
  4. Agent 展示 revealAfterAction
  5. 推进到下一个 Checkpoint

最后一个 Checkpoint 操作完毕后:
  → 强制平仓（以最终价格卖出所有持仓）
  → 展示 Scorecard
```

---

## 实现方式：Skill + Agent Tool

### 1. Skill (`skills/storymode/SKILL.md`)

Skill 负责给 Agent 注入 story mode 的行为指令：

- 如何按顺序展示 checkpoint
- 如何引导用户操作
- 叙事语气和格式
- Scorecard 模板

### 2. Agent Tool (`story_*` tools)

后端提供 3 个 Agent Tool，管理故事状态：

| Tool           | 功能                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `story_start`  | 加载剧本，初始化独立 portfolio（不影响主账户），返回第一个 checkpoint                           |
| `story_action` | 在当前 checkpoint 执行交易（按历史价格成交）或 skip，返回 revealAfterAction + 下一个 checkpoint |
| `story_status` | 查询当前故事进度、持仓、现金、累计 P&L                                                          |

### 3. 后端服务 (`src/storymode/`)

```
src/storymode/
├── stories/              # 剧本 JSON 文件
│   └── googl-2025-q3.json
├── story-engine.ts       # 状态机：加载剧本、推进 checkpoint、计算 P&L
├── story-store.ts        # 持久化进行中的游戏存档 (~/.openclaw/storymode/)
└── story-tools.ts        # Agent tool 定义（TypeBox schemas）
```

### 4. RPC Handlers（可选，UI 用）

`src/gateway/server-methods/storymode.ts`：

- `storymode.list` — 可用剧本列表
- `storymode.start` — 开始故事
- `storymode.action` — 执行操作
- `storymode.status` — 当前状态

---

## Scorecard 设计

```
╔══════════════════════════════════════╗
║  Google 2025 Q3 财报风暴 — 成绩单    ║
╠══════════════════════════════════════╣
║  初始资金:       $100,000            ║
║  最终净值:       $109,714            ║
║  总收益:         +$9,714 (+9.71%)    ║
║                                      ║
║  vs 买入持有:    +12.94% (你跑输)    ║
║  vs 空仓:       +9.71%  (你跑赢)    ║
║                                      ║
║  交易次数:       3                   ║
║  最大回撤:       -4.2%              ║
║  胜率:           66.7%              ║
╚══════════════════════════════════════╝
```

---

## 关键设计决策

1. **独立 portfolio** — 故事使用隔离的虚拟账户，不影响主账户持仓和现金
2. **历史价格硬编码** — 不调用实时 API，checkpoint 中直接写死真实历史价格
3. **纯文字交互** — 通过 Agent 对话推进剧情，无需专门 UI（后续可加）
4. **Skill 驱动叙事** — 剧情呈现、语气、格式由 SKILL.md 控制，Agent 负责表演
5. **Tool 管理状态** — 后端 story engine 管理状态机，Agent 无需自行追踪进度

---

## 扩展方向

- **更多剧本**：NVDA GTC 2025、BTC 减半、TSLA Robotaxi Day、CPI 数据日
- **多标的故事**：一个故事涉及多支股票（如 NVDA + AMD 的 AI 芯片战争）
- **难度等级**：新手模式（给明确提示）/ 专家模式（只给原始新闻）
- **排行榜**：同一剧本不同玩家的收益对比
- **期权/合约模式**：在故事中使用期权或合约工具，增加策略维度
