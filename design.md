# ClawCapital 产品线设计文档

> 将交易模拟拆分为 4 条独立产品线，每条产品线有独立的交易规则、保证金模型、费率体系和风控逻辑。
> 所有产品线共享同一个账户余额（统一保证金账户），但仓位、订单、风控各自独立。

---

## 产品线总览

| 产品线           | 标的示例           | 方向      | 杠杆    | 保证金           | 结算            | 当前状态                |
| ---------------- | ------------------ | --------- | ------- | ---------------- | --------------- | ----------------------- |
| **美股现货**     | AAPL, NVDA, TSLA   | 只做多    | 无      | 无               | T+0（模拟简化） | ✅ 已实现（需移除做空） |
| **加密现货**     | BTC, ETH, SOL      | 只做多    | 无      | 无               | 即时            | ✅ 已实现（需移除做空） |
| **加密永续合约** | BTC-PERP, ETH-PERP | 多/空     | 1x~150x | 隔离/全仓        | 永续（无到期）  | ❌ 待实现               |
| **美股期权**     | NVDA Call/Put      | 看涨/看跌 | 内含    | 无（只付权利金） | 到期自动结算    | ❌ 待实现               |

> **设计决策：** 美股做空用期权（Long Put）而非 CFD/融券。买方最大亏损 = 权利金，无需保证金、无需强平、无需后台轮询。到期日机制增加游戏性。

---

## 一、美股现货 (US Stock Spot)

### 1.1 产品定义

模拟美股券商的零佣金现货交易，只做多，无杠杆，最贴近 Robinhood / Webull 体验。

### 1.2 交易规则

| 规则         | 说明                                 |
| ------------ | ------------------------------------ |
| 方向         | 仅做多（Buy / Sell）                 |
| 杠杆         | 无（1x，全额现金）                   |
| 最小交易单位 | 1 股（不支持碎股，简化）             |
| 价格来源     | Yahoo Finance API                    |
| 交易时间     | 模拟盘不限制（真实为 9:30-16:00 ET） |
| 结算         | T+0（真实为 T+2，模拟简化为即时）    |
| 做空         | **不支持**（做空走 CFD 产品线）      |

### 1.3 费率

无。零佣金、零滑点、零额外费用。

### 1.4 订单类型

- [x] 市价单（Market Order）—— 仅支持市价单，按当前价即时成交

> 止损 / 止盈等条件逻辑由 Agent 监控价格后发市价单实现，后端不维护挂单状态。

### 1.5 当前代码映射

```
现有代码                          改造方向
─────────────────────────────    ─────────────────────
portfolio.buyStock()            → 保留，加 assetClass="us_stock_spot" 标记
portfolio.sellStock()           → 保留
portfolio.shortStock()          → 美股现货不再调用，移至 CFD
TradingEngine.executeBuy()      → 加费率计算
StockMarketData.fetchQuote()    → 保留
```

### 1.6 数据模型

```typescript
interface SpotPosition {
  ticker: string; // "AAPL"
  assetClass: "us_stock_spot";
  quantity: number; // 整数
  averagePrice: number;
  currentPrice: number;
  marketValue: number; // quantity × currentPrice
  unrealizedPnl: number; // marketValue - costBasis
  unrealizedPnlPercent: number;
}
```

---

## 二、加密现货 (Crypto Spot)

### 2.1 产品定义

模拟 Binance / Coinbase 现货交易，只做多，无杠杆，支持小数数量。

### 2.2 交易规则

| 规则         | 说明                               |
| ------------ | ---------------------------------- |
| 方向         | 仅做多（Buy / Sell）               |
| 杠杆         | 无（1x，全额 USDT）                |
| 最小交易单位 | 0.0001（支持小数）                 |
| 价格来源     | Binance REST API                   |
| 交易时间     | 7×24 小时                          |
| 结算         | 即时                               |
| 计价货币     | USDT                               |
| 做空         | **不支持**（做空走永续合约产品线） |

### 2.3 费率

无。零手续费、零滑点。

### 2.4 订单类型

- [x] 市价单 —— 仅支持市价单，按当前价即时成交

> 止损 / 止盈等条件逻辑由 Agent 监控价格后发市价单实现，后端不维护挂单状态。

### 2.5 当前代码映射

```
现有代码                          改造方向
─────────────────────────────    ─────────────────────
portfolio.buyStock()            → 保留，加 assetClass="crypto_spot" 标记
portfolio.sellStock()           → 保留
portfolio.shortStock()          → 加密现货不再调用，移至永续合约
MarketData.fetchQuote()         → 保留
```

### 2.6 数据模型

```typescript
interface CryptoSpotPosition {
  ticker: string; // "BTC"
  assetClass: "crypto_spot";
  quantity: number; // 支持小数
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}
```

---

## 三、加密永续合约 (Crypto Perpetual Futures)

### 3.1 产品定义

模拟 Binance Futures / Bybit 的 USDT 永续合约。支持多空双向、可调杠杆、自动强平、资金费率。这是模拟盘的**核心差异化产品**。

### 3.2 交易规则

| 规则         | 说明                                              |
| ------------ | ------------------------------------------------- |
| 方向         | 多（Long）/ 空（Short）                           |
| 杠杆         | 1x ~ 150x（对齐 Binance Futures，默认 20x）       |
| 保证金模式   | 逐仓（Isolated）优先，后续支持全仓（Cross）       |
| 最小交易单位 | 0.001                                             |
| 价格来源     | Binance REST API（与现货共用）                    |
| 标记价格     | 取 Binance 现货价（简化，不单独计算 index price） |
| 交易时间     | 7×24 小时                                         |
| 结算         | 永续（无到期日）                                  |
| 计价货币     | USDT                                              |
| 支持标的     | BTC-PERP, ETH-PERP, SOL-PERP, BNB-PERP 等         |

### 3.3 保证金机制

#### 逐仓模式（Isolated Margin）

```
初始保证金     = 名义价值 / 杠杆
              = quantity × entryPrice / leverage

维持保证金     = 名义价值 × 维持保证金率
              = quantity × markPrice × maintenanceMarginRate

维持保证金率   = 根据名义价值分档（参考 Binance）:
              ├── < $50,000     → 0.4%
              ├── < $250,000    → 0.5%
              ├── < $1,000,000  → 1.0%
              └── ≥ $1,000,000  → 2.5%
```

#### 强平价格（Liquidation Price）

```
做多强平价 = entryPrice × (1 - 1/leverage + maintenanceMarginRate)
做空强平价 = entryPrice × (1 + 1/leverage - maintenanceMarginRate)

示例 1（BTC 做多，10x 杠杆，维持保证金率 0.4%）:
  entryPrice = $60,000
  强平价 = 60,000 × (1 - 0.1 + 0.004) = $54,240
  → 价格下跌 9.6% 时强平

示例 2（BTC 做多，100x 杠杆，维持保证金率 0.4%）:
  entryPrice = $60,000
  强平价 = 60,000 × (1 - 0.01 + 0.004) = $59,640
  → 价格下跌 0.6% 即强平 —— 高杠杆 = 高刺激 + 高风险

示例 3（ETH 做空，50x 杠杆，维持保证金率 0.4%）:
  entryPrice = $3,000
  强平价 = 3,000 × (1 + 0.02 - 0.004) = $3,048
  → 价格上涨 1.6% 即强平
```

#### 强平流程

```
1. 每 10 秒轮询最新价格
2. 对比标记价格与各仓位强平价
3. 触发强平条件:
   - 做多: markPrice ≤ liquidationPrice
   - 做空: markPrice ≥ liquidationPrice
4. 强平执行:
   - 以标记价格强制平仓
   - 扣除清算手续费（名义价值 × 0.5%）
   - 释放剩余保证金（如有）回到可用余额
   - 发送 WebSocket 事件: futures.liquidation
   - UI 弹窗通知
5. 保证金不足以覆盖亏损时:
   - 逐仓模式: 最多亏完该仓位保证金，不影响其他仓位
   - 社会化分摊（不实现）—— 模拟盘简化处理
```

### 3.4 费率

无。零手续费、零滑点、零资金费率。强平时直接按标记价格平仓，不额外扣费。

### 3.6 P&L 计算

```
未实现 PnL (做多) = (markPrice - entryPrice) × quantity
未实现 PnL (做空) = (entryPrice - markPrice) × quantity

ROE% = 未实现 PnL / 初始保证金 × 100%
     = 未实现 PnL / (entryPrice × quantity / leverage) × 100%

示例 1（10x 杠杆）:
  做多 1 BTC @ $60,000, 10x
  初始保证金 = $6,000
  BTC 涨到 $63,000 (+5%)
  未实现 PnL = $3,000
  ROE% = +50%

示例 2（100x 杠杆）:
  做多 1 BTC @ $60,000, 100x
  初始保证金 = $600
  BTC 涨到 $60,600 (+1%)
  未实现 PnL = $600
  ROE% = +100%  ← $600 本金翻倍，只需价格涨 1%
```

### 3.5 订单类型

- [ ] 市价开多 / 开空
- [ ] 市价平多 / 平空（部分或全部）

> 仅市价单。Agent 负责监控价格并在需要时发出市价平仓指令，替代传统的止损 / 止盈挂单。

### 3.8 数据模型

```typescript
interface FuturesPosition {
  id: string; // UUID
  ticker: string; // "BTC" (展示用), 合约标识 "BTC-PERP"
  assetClass: "crypto_perp";
  side: "long" | "short";
  quantity: number;
  entryPrice: number; // 开仓均价
  markPrice: number; // 最新标记价格
  leverage: number; // 1~125
  marginMode: "isolated"; // 后续扩展 "cross"

  // 保证金
  initialMargin: number; // entryPrice × quantity / leverage
  maintenanceMargin: number; // markPrice × quantity × mmRate
  marginBalance: number; // initialMargin + 追加保证金（如有）

  // 强平
  liquidationPrice: number;
  maintenanceMarginRate: number; // 0.004, 0.005, 0.01

  // P&L
  unrealizedPnl: number;
  roe: number; // ROE%
  realizedPnl: number; // 部分平仓已实现 P&L

  // 时间
  openedAt: string; // ISO 8601
  updatedAt: string;
}
```

### 3.9 Agent Tools (新增)

```
futures_open_long    — 市价开多
futures_open_short   — 市价开空
futures_close        — 市价平仓（部分或全部）
futures_get          — 查询合约仓位
futures_set_leverage — 设置杠杆
```

### 3.10 RPC Methods (新增)

```
futures.positions    — 获取所有合约仓位（含实时 P&L、保证金率、强平价）
futures.open         — 市价开仓（多/空）
futures.close        — 市价平仓
futures.leverage     — 设置杠杆
futures.account      — 查询合约账户（可用余额、已用保证金）
```

---

## 四、美股期权 (US Stock Options)

### 4.1 产品定义

简化版美股期权，只做买方（Long Call / Long Put）。买 Call 看涨，买 Put 看跌。
**买方只需支付权利金，最大亏损固定，无需保证金，无需强平，无需后台轮询。**

> **为什么用期权而不是 CFD / 融券？**
>
> - 期权买方最大亏损 = 权利金，天然封顶，不需要强平引擎
> - 到期日机制增加时间紧迫感，更有游戏性
> - 内含杠杆（$500 权利金可以控制 $50,000 股票），不需要手动设置杠杆
> - 无需后台轮询任务（到期结算是离散事件，不是持续监控）
> - "花 $2,000 赌 NVDA 下周跌" 比 "开 20x 空单保证金率 10%" 更直觉

### 4.2 交易规则

| 规则     | 说明                                                 |
| -------- | ---------------------------------------------------- |
| 方向     | 买入看涨（Long Call）/ 买入看跌（Long Put）          |
| 卖方     | **不支持**（不做期权卖方，避免无限亏损风险）         |
| 杠杆     | 内含（由期权定价机制天然提供）                       |
| 保证金   | **无**（买方只付权利金）                             |
| 强平     | **无**（最多亏完权利金）                             |
| 合约乘数 | 100 股 / 合约（标准美股期权）                        |
| 价格来源 | Yahoo Finance（标的价格）+ 简化 BSM 定价（期权价格） |
| 交易时间 | 模拟盘不限制                                         |
| 行权方式 | 到期自动结算（欧式简化），不支持提前行权             |
| 支持标的 | 所有 Yahoo Finance 可查的美股                        |

### 4.3 期权链生成（简化版）

不接入真实期权链，由系统自动生成：

```
到期日:
  - 本周五（周期权）
  - 下周五
  - 本月第三个周五（月期权）
  - 下月第三个周五

行权价:
  以当前股价为中心，上下各生成 10 个档位
  档位间距 = 根据股价自动调整:
    ├── 股价 < $50    → $1 间距
    ├── 股价 < $200   → $5 间距
    ├── 股价 < $500   → $10 间距
    └── 股价 ≥ $500   → $25 间距

  示例 (AAPL @ $230):
    Put: 180, 185, 190, ..., 225, 230, 235, ..., 275, 280
    Call: 同上
```

### 4.4 期权定价（简化 BSM）

```
权利金 = 内在价值 + 时间价值

内在价值:
  Call = max(currentPrice - strikePrice, 0)
  Put  = max(strikePrice - currentPrice, 0)

时间价值（简化公式）:
  timeValue = currentPrice × impliedVol × sqrt(daysToExpiry / 365)

隐含波动率（固定模拟值）:
  ├── 大盘股 (AAPL, MSFT, GOOGL)    → 25%
  ├── 成长股 (TSLA, NVDA, AMD)       → 45%
  ├── Meme 股 (GME, AMC)             → 80%
  └── 默认                            → 35%

权利金 = 每股价格 × 100（合约乘数）

示例（买 NVDA Put, 当前价 $800, 行权价 $750, 7 天到期, IV=45%）:
  内在价值 = max(750 - 800, 0) = $0（虚值）
  时间价值 = 800 × 0.45 × sqrt(7/365) ≈ $49.88
  每股权利金 ≈ $49.88
  每张合约权利金 = $49.88 × 100 = $4,988

  如果 NVDA 跌到 $700:
    内在价值 = max(750 - 700, 0) × 100 = $5,000
    盈利 = $5,000 - $4,988 = $12（刚回本）

  如果 NVDA 跌到 $650:
    内在价值 = max(750 - 650, 0) × 100 = $10,000
    盈利 = $10,000 - $4,988 = $5,012（+100% 回报）
```

### 4.5 期权价格实时更新

```
持仓期权的当前价值随标的价格变动实时更新:
  当前权利金 = 内在价值(基于最新标的价) + 剩余时间价值

每次查询持仓时重新计算，不需要后台轮询。
```

### 4.6 到期结算

```
到期时自动结算（每日检查一次即可）:

实值期权（In The Money）:
  Call: currentPrice > strikePrice → 返还 (currentPrice - strikePrice) × 100 × contracts
  Put:  currentPrice < strikePrice → 返还 (strikePrice - currentPrice) × 100 × contracts

虚值期权（Out of The Money）:
  Call: currentPrice ≤ strikePrice → 归零，不返还
  Put:  currentPrice ≥ strikePrice → 归零，不返还

结算金额直接加回可用余额。
```

### 4.7 费率

无。零佣金、零手续费。

### 4.8 订单类型

- [ ] 市价买入期权（Buy to Open）
- [ ] 市价卖出期权（Sell to Close，提前平仓）

> 仅市价单。买入时按当前权利金即时成交，卖出时按当前权利金即时成交。

### 4.9 数据模型

```typescript
// 期权合约定义（系统生成，非持久化）
interface OptionContract {
  underlying: string; // "NVDA"
  type: "call" | "put";
  strikePrice: number; // 行权价
  expiryDate: string; // "2026-02-14" (YYYY-MM-DD)
  multiplier: 100; // 合约乘数
  impliedVol: number; // 隐含波动率
}

// 期权合约标识符格式: "NVDA-250214-P-750"
//                       标的-到期日-类型-行权价

// 玩家持有的期权仓位
interface OptionPosition {
  id: string; // UUID
  contract: OptionContract;
  assetClass: "us_stock_option";
  contracts: number; // 持有合约数量
  premiumPaid: number; // 买入时支付的总权利金
  premiumPerShare: number; // 买入时每股权利金
  currentPremium: number; // 当前每股权利金（实时计算）
  currentValue: number; // 当前总价值 = currentPremium × 100 × contracts

  // P&L
  unrealizedPnl: number; // currentValue - premiumPaid
  unrealizedPnlPercent: number;

  // 时间
  daysToExpiry: number; // 剩余天数
  openedAt: string;
  expiryDate: string;
}
```

### 4.10 Agent Tools (新增)

```
options_chain       — 查询期权链（指定标的，返回可用的行权价和到期日）
options_buy         — 市价买入期权（Long Call / Long Put）
options_sell        — 市价卖出期权（提前平仓）
options_get         — 查询当前期权持仓
options_quote       — 查询指定期权合约的当前权利金
```

### 4.11 RPC Methods (新增)

```
options.chain       — 获取期权链（行权价列表 + 权利金报价）
options.buy         — 买入期权
options.sell        — 卖出期权（提前平仓）
options.positions   — 获取所有期权持仓（含实时权利金和 P&L）
options.quote       — 查询指定合约权利金
```

---

## 五、统一账户模型

### 5.1 账户结构

所有产品线共享一个账户，资金在各产品线间通用。

```typescript
interface UnifiedAccount {
  // 资金
  totalBalance: number; // 总余额（含冻结保证金）
  availableBalance: number; // 可用余额 = totalBalance - 全部冻结保证金
  totalUnrealizedPnl: number; // 所有衍生品未实现 P&L

  // 按产品线拆分
  spotEquity: number; // 现货持仓市值（美股 + 加密）
  futuresMarginUsed: number; // 永续合约冻结保证金总和
  optionsValue: number; // 期权持仓当前总价值

  // 统计
  totalRealizedPnl: number; // 累计已实现 P&L
}

// 可用余额计算
availableBalance = totalBalance - Σ(现货持仓成本) - Σ(合约仓位初始保证金) - Σ(期权已付权利金);
```

### 5.2 资产净值 (Net Equity)

```
Net Equity = availableBalance
           + Σ(现货持仓市值)
           + Σ(合约仓位保证金 + 未实现PnL)
           + Σ(期权持仓当前价值)
```

---

## 六、产品线对比速查表

| 维度     | 美股现货   | 加密现货 | 加密永续        | 美股期权             |
| -------- | ---------- | -------- | --------------- | -------------------- |
| 方向     | 仅多       | 仅多     | 多/空           | 看涨(Call)/看跌(Put) |
| 杠杆     | 1x         | 1x       | 1x~150x         | 内含（期权天然杠杆） |
| 保证金   | 无         | 无       | 初始+维持       | 无（只付权利金）     |
| 强平     | 无         | 无       | 有              | 无（最多亏完权利金） |
| 做空机制 | N/A        | N/A      | 合约做空        | 买 Put               |
| 费用     | 无         | 无       | 无              | 无                   |
| 到期日   | 无         | 无       | 永续            | 有（周/月到期）      |
| 价格来源 | Yahoo      | Binance  | Binance         | Yahoo + BSM 定价     |
| 交易时间 | 不限(模拟) | 7×24     | 7×24            | 不限(模拟)           |
| 最小单位 | 1 股       | 0.0001   | 0.001           | 1 张(=100股)         |
| 标识格式 | `AAPL`     | `BTC`    | `BTC-PERP:LONG` | `NVDA-250214-P-750`  |

---

## 七、技术架构

### 7.1 目录结构

```
src/
├── account/
│   ├── unified-account.ts          # 统一账户模型
│   └── account-store.ts            # 账户持久化
│
├── spot/                           # 现货交易（美股 + 加密共用）
│   ├── spot-engine.ts              # 现货交易引擎（从 trading-engine.ts 重构）
│   └── spot-position.ts            # 现货持仓模型
│
├── futures/                        # 加密永续合约
│   ├── futures-engine.ts           # 合约交易引擎
│   ├── futures-position.ts         # 合约仓位模型
│   ├── futures-store.ts            # 合约仓位持久化
│   ├── liquidation-engine.ts       # 强平引擎（定时轮询）
│   └── margin-calculator.ts        # 保证金计算器
│
├── options/                         # 美股期权
│   ├── options-engine.ts            # 期权交易引擎（买入/卖出/到期结算）
│   ├── options-position.ts          # 期权仓位模型
│   ├── options-store.ts             # 期权仓位持久化
│   ├── options-chain.ts             # 期权链生成（行权价 + 到期日）
│   └── options-pricing.ts           # 简化 BSM 定价
│
├── market-data/                    # 行情数据（从 portfolio/ 抽出）
│   ├── binance.ts                  # Binance REST (crypto)
│   ├── yahoo.ts                    # Yahoo Finance (stock)
│   └── price-cache.ts              # 统一价格缓存
│
├── portfolio/                      # 保留，重构为读取层
│   ├── portfolio-store.ts          # 保留（现货数据）
│   ├── portfolio.ts                # 简化为仅现货，移除 short/cover
│   └── index.ts                    # 聚合所有产品线的 enriched snapshot
│
├── agents/tools/
│   ├── spot-tools.ts               # 现货 tools (buy/sell)
│   ├── futures-tools.ts            # 永续合约 tools
│   ├── options-tools.ts             # 期权 tools
│   └── portfolio-tools.ts         # 重构：聚合查询（总览）
│
└── gateway/server-methods/
    ├── spot.ts                     # 现货 RPC
    ├── futures.ts                  # 合约 RPC
    ├── options.ts                  # 期权 RPC
    └── portfolio.ts                # 重构：统一概览 RPC
```

### 7.2 持久化方案

维持现有 JSON 文件方案，按产品线分文件：

```
~/.openclaw/
├── account.json          # 统一账户余额
├── spot-positions.json   # 现货持仓（原 portfolio.json 迁移）
├── futures-positions.json # 合约仓位
├── options-positions.json # 期权仓位
└── snapshots.json        # 每日净值快照
```

### 7.3 定时任务（复用现有 CronService）

项目已有完整的 CronService（`src/cron/service.ts`，基于 `croner` 库），Gateway 启动时自动 `cron.start()`。**不需要自建 Tick 引擎，直接注册 cron job 即可。**

现有能力：

- `cron.add()` 注册 recurring / one-shot 任务
- 标准 cron 表达式（`*/10 * * * * *` = 每 10 秒）
- 指数退避（失败后 30s → 1m → 5m → 15m → 60m）
- 10 分钟执行超时保护
- 任务状态持久化（重启后恢复）
- `OPENCLAW_SKIP_CRON` 环境变量可关闭

#### 需要注册的 Cron Job

| Job 名称              | Cron 表达式      | 频率       | 说明                                                   |
| --------------------- | ---------------- | ---------- | ------------------------------------------------------ |
| `futures.liquidation` | `*/10 * * * * *` | 每 10 秒   | 获取最新价，对比各合约仓位强平价，触发则强平并广播事件 |
| `options.expiry`      | `0 0 * * * *`    | 每 1 小时  | 检查是否有到期期权，自动结算实值/虚值                  |
| `portfolio.snapshot`  | `0 0 0 * * *`    | 每日 00:00 | 记录当日资产净值快照                                   |

#### 注册方式

```typescript
// src/gateway/server-cron.ts 中注册交易相关 cron job
import { checkFuturesLiquidation } from "../futures/liquidation-engine.js";
import { settleExpiredOptions } from "../options/options-engine.js";
import { recordDailySnapshot } from "../portfolio/index.js";

export function registerTradingCronJobs(cron: CronService, broadcast: BroadcastFn) {
  cron.add({
    name: "futures.liquidation",
    schedule: { every: "10s" },
    execute: () => checkFuturesLiquidation(broadcast),
  });

  cron.add({
    name: "options.expiry",
    schedule: { every: "1h" },
    execute: () => settleExpiredOptions(broadcast),
  });

  cron.add({
    name: "portfolio.snapshot",
    schedule: { every: "24h" },
    execute: () => recordDailySnapshot(),
  });
}
```

#### 扩展

后续新增定时任务同样通过 `cron.add()` 注册：

```typescript
// Agent 盯盘
cron.add({ name: "agent.priceWatch", schedule: { every: "30s" }, execute: ... });

// 排行榜刷新
cron.add({ name: "leaderboard.refresh", schedule: { every: "1h" }, execute: ... });
```

---

## 八、UI 改造

### 8.1 产品线 Tab 切换

```
Portfolio 页面顶部增加 Tab:

  ┌──────────┬──────────┬──────────┬──────────┐
  │ 总览      │ 现货      │ 永续合约   │ 期权      │
  │ Overview  │ Spot     │ Futures  │ Options  │
  └──────────┴──────────┴──────────┴──────────┘
```

### 8.2 各 Tab 展示内容

**总览 (Overview)**

- 账户净值、可用余额
- 各产品线市值占比饼图
- 今日 P&L（汇总）
- 全部持仓列表（按 P&L 排序）

**现货 (Spot)**

- 美股 + 加密现货持仓列表
- Buy / Sell 表单
- 仅多头，无保证金相关 UI

**永续合约 (Futures)**

- 合约仓位列表（含杠杆、保证金率、强平价、ROE%）
- 开多 / 开空表单（含杠杆滑块）
- 平仓表单
- 保证金率进度条（接近强平时变红）

**期权 (Options)**

- 期权链浏览（选标的 → 选到期日 → 选行权价 → 看 Call/Put 权利金）
- 期权持仓列表（合约名、权利金成本、当前价值、P&L、剩余天数）
- 买入 / 卖出表单
- 到期倒计时提示

---

## 九、迁移策略

### Phase 0: 现有代码修复（立即）

1. **移除现货做空**：`portfolio.shortStock()` / `coverStock()` 从现货路径移除
2. **加临时强平保护**：对已有的 short 仓位加现金为负的保护
3. **加 `assetClass` 字段**：在持仓数据中标记产品线

### Phase 1: 合约引擎（P0 核心）

1. 新建 `src/futures/` 模块
2. 实现 `FuturesEngine`（开仓、平仓、P&L）
3. 实现 `LiquidationEngine`（10 秒轮询）
4. 实现 `MarginCalculator`（保证金 + 强平价计算）
5. 新增 `futures.*` RPC 方法
6. 新增 `futures_*` Agent Tools
7. UI Futures Tab

### Phase 2: 期权引擎

1. 新建 `src/options/` 模块
2. 实现 `OptionsPricing`（简化 BSM 定价）
3. 实现 `OptionsChain`（自动生成行权价 + 到期日）
4. 实现 `OptionsEngine`（买入、卖出、到期结算）
5. 新增 `options.*` RPC 方法
6. 新增 `options_*` Agent Tools
7. UI Options Tab

### Phase 3: 统一账户重构

1. 新建 `src/account/` 统一账户
2. 从各产品线聚合资产净值
3. Portfolio Overview Tab
4. 迁移 `portfolio.json` 数据到新结构
