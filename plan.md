# ClawCapital TODO

> 详细设计见 [design.md](./design.md)
> 4 条产品线：美股现货 | 加密现货 | 加密永续合约 | 美股期权

---

## Phase 0: 现有代码清理 ✅

> 在开发新功能之前，先把当前代码中不合理的部分修掉。

- [x] **移除现货做空** — `portfolio_short` / `portfolio_cover` 工具已删除，`executeShort` / `executeCover` 已从 TradingEngine 移除，gateway `portfolio.trade` 仅支持 buy/sell，`shortStock()` / `coverStock()` 标记 `@deprecated`
- [x] **移除限价单** — `price` 参数已从 TradingEngine、Agent Tools、Gateway RPC 全部移除，后端始终获取市价成交
- [x] **防止现金为负** — `coverStock()` 中 `cash = Math.max(0, cash + marginReleased + pnl)`，`adjustCash()` 同样有 floor 保护
- [x] **加 `assetClass` 字段** — `Holding` 接口新增 `assetClass?: "us_stock_spot" | "crypto_spot"`，`buyStock()` 自动根据 `assetType` 设置，`HoldingWithPnL` 输出中包含
- [x] **更新 Agent Tool 描述** — `portfolio_short` / `portfolio_cover` 已直接删除（而非废弃），做空走 futures/options 工具

---

## Phase 1: 加密永续合约 ✅

> 核心差异化产品。支持多空双向、1x~150x 杠杆、逐仓保证金、自动强平。

### 1.1 合约仓位模型 ✅

- [x] `src/futures/futures-position.ts` — `FuturesPosition`、`FuturesAccount`、`FuturesTransaction` 类型定义
- [x] `src/futures/futures-store.ts` — JSON 持久化（`~/.openclaw/futures-positions.json`），原子写入

### 1.2 保证金计算器 ✅

- [x] `src/futures/margin-calculator.ts`
  - [x] `calcInitialMargin(quantity, entryPrice, leverage)`
  - [x] `calcMaintenanceMarginRate(notionalValue)` — 4 档：<$50k→0.4%, <$250k→0.5%, <$1M→1.0%, ≥$1M→2.5%
  - [x] `calcLiquidationPrice(entryPrice, leverage, mmRate, side)`
  - [x] `calcUnrealizedPnl(side, quantity, entryPrice, markPrice)`
  - [x] `calcROE(unrealizedPnl, initialMargin)`

### 1.3 合约交易引擎 ✅

- [x] `src/futures/futures-engine.ts`
  - [x] `openLong()` / `openShort()` — 市价开仓，冻结保证金
  - [x] `closePosition(positionId, quantity?)` — 市价平仓（部分或全部）
  - [x] `setLeverage(ticker, leverage)` — 无持仓时修改杠杆
  - [x] `getPositions()` — 实时刷新价格 + P&L
  - [x] `liquidatePosition()` — 强平执行（供 liquidation engine 调用）

### 1.4 强平引擎 ✅

- [x] `src/futures/liquidation-engine.ts` — `checkFuturesLiquidation()` 遍历仓位对比强平价
- [x] `server.impl.ts` 中注册 `setInterval` 每 10 秒执行，含 cleanup

### 1.5 Gateway RPC ✅

- [x] `src/gateway/server-methods/futures.ts` — `futures.positions`、`futures.open`、`futures.close`、`futures.leverage`、`futures.account`
- [x] 在 `server-methods.ts` 注册

### 1.6 Agent Tools ✅

- [x] `src/agents/tools/futures-tools.ts` — `futures_open_long`、`futures_open_short`、`futures_close`、`futures_get`、`futures_set_leverage`
- [x] 在 `openclaw-tools.ts` 注册

### 1.7 UI — Futures Tab

- [ ] 在 portfolio 页面顶部增加 Tab 切换（总览 / 现货 / 永续合约 / 期权）
- [ ] 合约仓位列表：标的 | 方向 | 数量 | 杠杆 | 开仓价 | 标记价 | 未实现PnL | ROE% | 保证金率 | 强平价
- [ ] 保证金率进度条（接近强平时变红）
- [ ] 开多 / 开空表单（标的输入 + 数量输入 + 杠杆滑块 1x~150x）
- [ ] 平仓表单（数量输入，支持部分平仓）
- [ ] 强平事件弹窗通知（监听 `futures.liquidation` WebSocket 事件）

---

## Phase 2: 美股期权 ✅

> 简化版期权，只做买方（Long Call / Long Put）。无需保证金，无需强平，无需后台轮询。

### 2.1 期权定价 ✅

- [x] `src/options/options-pricing.ts`
  - [x] `calcPremium()` — 简化 BSM：内在价值 + 时间价值
  - [x] `getImpliedVol(ticker)` — 按标的分类返回固定 IV
  - [x] `calcIntrinsicValue()`、`calcTimeValue()`、`calcDaysToExpiry()`

### 2.2 期权链生成 ✅

- [x] `src/options/options-chain.ts`
  - [x] `generateChain(ticker, currentPrice)` — 到期日 + 行权价 + Call/Put 权利金
  - [x] 到期日：本周五、下周五、本月第三个周五、下月第三个周五
  - [x] 行权价：以当前价为中心上下各 10 档，间距自动调整

### 2.3 期权交易引擎 ✅

- [x] `src/options/options-engine.ts`
  - [x] `buyOption()` — 买入期权，扣权利金
  - [x] `sellOption()` — 卖出期权（提前平仓）
  - [x] `settleExpiredOptions(broadcast)` — 到期结算（ITM 返现 / OTM 归零）
  - [x] `getPositions()` — 实时权利金 + P&L
  - [x] `getQuote()` — 查询指定合约权利金
- [x] `src/options/options-store.ts` — JSON 持久化
- [x] `server.impl.ts` 注册 `setInterval` 每 1 小时检查到期

### 2.4 Gateway RPC ✅

- [x] `src/gateway/server-methods/options.ts` — `options.chain`、`options.buy`、`options.sell`、`options.positions`、`options.quote`
- [x] 在 `server-methods.ts` 注册

### 2.5 Agent Tools ✅

- [x] `src/agents/tools/options-tools.ts` — `options_chain`、`options_buy`、`options_sell`、`options_get`、`options_quote`
- [x] 在 `openclaw-tools.ts` 注册

### 2.6 UI — Options Tab

- [ ] 期权链浏览器（选标的 → 选到期日 → 行权价表格，每行显示 Call 权利金 | 行权价 | Put 权利金）
- [ ] 期权持仓列表：合约名 | 类型 | 数量 | 成本 | 当前价值 | P&L | 剩余天数
- [ ] 买入表单（标的 + 类型 Call/Put + 行权价 + 到期日 + 合约数量）
- [ ] 卖出表单（选择持仓 → 输入数量）
- [ ] 到期倒计时提示（<24h 高亮警告）
- [ ] 到期结算通知（监听 `options.expired` WebSocket 事件）

---

## Phase 3: 统一账户与 Portfolio 重构 ✅

> 将各产品线的资金统一管理，Portfolio Overview 聚合展示。

### 3.1 统一账户 ✅

- [x] 新建 `src/account/unified-account.ts` — `getUnifiedAccountSnapshot()` 只读聚合：cash, totalEquity, availableBalance, spotEquity, futuresMarginUsed, futuresUnrealizedPnl, optionsValue, totalUnrealizedPnl
- [x] ~~`account-store.ts`~~ 不需要 — 现金留在 `portfolio.json`，各产品线通过 `portfolio.adjustCash(delta)` 共享余额
- [x] 各产品线引擎已通过 `portfolio.adjustCash()` 操作统一余额

### 3.2 Portfolio 重构 ✅

- [x] `portfolio.ts` 彻底删除 `shortStock()` / `coverStock()`，`getPortfolioValue()` 简化为仅现货
- [x] `portfolio-store.ts` 移除 `HoldingSide`、`side`、`marginUsed`，Transaction.type 仅 `"buy"|"sell"`
- [x] `index.ts` 中 `getEnrichedSnapshot()` 聚合 spot + futures + options（动态 import 避免循环依赖）
- [x] 新增 `FuturesPositionSummary`、`OptionsPositionSummary`、`AnyPositionSummary`、统一 `PortfolioSnapshot` 接口
- [x] `portfolio-tools.ts` 无需修改 — `portfolio_get` 直接透传 `getEnrichedSnapshot()` 结果

### 3.3 数据迁移 ✅

- [x] ~~迁移脚本~~ 不需要 — 旧 `portfolio.json` 前向兼容（移除的字段被 JSON.parse 忽略，缺失的可选字段有默认值）

### 3.4 UI — Overview Tab

- [ ] 账户净值 + 可用余额
- [ ] 各产品线市值占比展示
- [ ] 今日 P&L（汇总所有产品线）
- [ ] 全部持仓列表（现货 + 合约 + 期权混合，按 P&L 排序）

### 3.5 每日快照 ✅

- [x] ~~Cron~~ 无需 cron — `getEnrichedSnapshot()` 每次调用时自动 `recordDailySnapshot(totalEquity)`，保留最近 90 天

---

## 已决策不做

| 项目                           | 原因                                            |
| ------------------------------ | ----------------------------------------------- |
| 条件订单（止损/止盈/追踪止损） | 由 Agent 监控价格后发市价单实现，后端不维护挂单 |
| 手续费 / 滑点 / 佣金           | 模拟盘追求刺激体验，零摩擦                      |
| 资金费率 / 隔夜费              | 同上                                            |
| 限价单                         | 仅市价单，简化后端                              |
| CFD 产品线                     | 已替换为期权（Long Put 做空，无需强平）         |
| 融券做空                       | 复杂度高，用期权替代                            |
| 期权卖方                       | 风险无限，模拟盘不做                            |
| 自建 Tick 引擎                 | 复用现有 CronService                            |
