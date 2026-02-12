import type { Story, Checkpoint } from "./stories/googl-2025-q3.js";
import { ALL_STORIES } from "./stories/googl-2025-q3.js";
import {
  type StoryGameState,
  type StoryStoreFile,
  type StoryTransaction,
  loadStoryStore,
  saveStoryStore,
} from "./story-store.js";

export interface ActionResult {
  action: "buy" | "sell" | "skip";
  quantity?: number;
  price?: number;
  cash: number;
  shares: number;
  revealAfterAction: string;
  nextCheckpoint?: Checkpoint;
  scorecard?: Scorecard;
}

export interface Scorecard {
  storyTitle: string;
  ticker: string;
  startingCash: number;
  finalNetValue: number;
  totalGain: number;
  gainPercent: number;
  buyAndHold: { finalValue: number; gainPercent: number };
  tradeCount: number;
}

export interface StatusResult {
  storyId: string;
  storyTitle: string;
  ticker: string;
  checkpoint: Checkpoint;
  checkpointIndex: number;
  totalCheckpoints: number;
  cash: number;
  shares: number;
  marketValue: number;
  unrealizedPnl: number;
  transactions: StoryTransaction[];
}

export class StoryEngine {
  private store: StoryStoreFile;

  private constructor(store: StoryStoreFile) {
    this.store = store;
  }

  static async create(): Promise<StoryEngine> {
    const store = await loadStoryStore();
    return new StoryEngine(store);
  }

  listStories(): { id: string; title: string; ticker: string }[] {
    return ALL_STORIES.map((s) => ({ id: s.id, title: s.title, ticker: s.ticker }));
  }

  async startStory(storyId: string): Promise<{
    storyId: string;
    title: string;
    ticker: string;
    startingCash: number;
    checkpoint: Checkpoint;
  }> {
    const story = ALL_STORIES.find((s) => s.id === storyId);
    if (!story) {
      throw new Error(
        `Story not found: ${storyId}. Available: ${ALL_STORIES.map((s) => s.id).join(", ")}`,
      );
    }

    const game: StoryGameState = {
      storyId: story.id,
      currentCheckpointIndex: 0,
      cash: story.startingCash,
      shares: 0,
      transactions: [],
      startedAt: new Date().toISOString(),
    };
    this.store = { version: 1, game };
    await saveStoryStore(this.store);

    return {
      storyId: story.id,
      title: story.title,
      ticker: story.ticker,
      startingCash: story.startingCash,
      checkpoint: story.checkpoints[0],
    };
  }

  async executeAction(action: "buy" | "sell" | "skip", quantity?: number): Promise<ActionResult> {
    const game = this.store.game;
    if (!game) {
      throw new Error("No active story. Use story_start first.");
    }
    const story = ALL_STORIES.find((s) => s.id === game.storyId);
    if (!story) {
      throw new Error(`Story data missing: ${game.storyId}`);
    }
    const checkpoint = story.checkpoints[game.currentCheckpointIndex];
    if (!checkpoint) {
      throw new Error("Story already completed.");
    }

    const price = checkpoint.price;
    let actualQty: number | undefined;

    if (action === "buy") {
      const qty = quantity ?? Math.floor(game.cash / price);
      if (qty <= 0) {
        throw new Error("Quantity must be > 0");
      }
      const cost = qty * price;
      if (cost > game.cash) {
        throw new Error(
          `Insufficient cash. Need $${cost.toFixed(2)}, have $${game.cash.toFixed(2)}`,
        );
      }
      game.cash -= cost;
      game.shares += qty;
      actualQty = qty;
    } else if (action === "sell") {
      const qty = quantity ?? game.shares;
      if (qty <= 0) {
        throw new Error("Quantity must be > 0");
      }
      if (qty > game.shares) {
        throw new Error(`Insufficient shares. Want to sell ${qty}, have ${game.shares}`);
      }
      game.cash += qty * price;
      game.shares -= qty;
      actualQty = qty;
    }

    game.transactions.push({
      checkpointId: checkpoint.id,
      action,
      quantity: actualQty,
      price: action === "skip" ? undefined : price,
      date: checkpoint.date,
    });

    const isLastCheckpoint = game.currentCheckpointIndex >= story.checkpoints.length - 1;

    if (isLastCheckpoint) {
      // Auto-liquidate remaining shares at final price
      if (game.shares > 0) {
        game.cash += game.shares * price;
        game.shares = 0;
      }
      const scorecard = this.buildScorecard(story, game);
      this.store.game = null;
      await saveStoryStore(this.store);

      return {
        action,
        quantity: actualQty,
        price: action === "skip" ? undefined : price,
        cash: game.cash,
        shares: game.shares,
        revealAfterAction: checkpoint.revealAfterAction,
        scorecard,
      };
    }

    game.currentCheckpointIndex += 1;
    await saveStoryStore(this.store);

    return {
      action,
      quantity: actualQty,
      price: action === "skip" ? undefined : price,
      cash: game.cash,
      shares: game.shares,
      revealAfterAction: checkpoint.revealAfterAction,
      nextCheckpoint: story.checkpoints[game.currentCheckpointIndex],
    };
  }

  getStatus(): StatusResult {
    const game = this.store.game;
    if (!game) {
      throw new Error("No active story. Use story_start first.");
    }
    const story = ALL_STORIES.find((s) => s.id === game.storyId);
    if (!story) {
      throw new Error(`Story data missing: ${game.storyId}`);
    }
    const checkpoint = story.checkpoints[game.currentCheckpointIndex];
    if (!checkpoint) {
      throw new Error("Story already completed.");
    }

    const marketValue = game.shares * checkpoint.price;
    const netValue = game.cash + marketValue;
    const unrealizedPnl = netValue - story.startingCash;

    return {
      storyId: game.storyId,
      storyTitle: story.title,
      ticker: story.ticker,
      checkpoint,
      checkpointIndex: game.currentCheckpointIndex,
      totalCheckpoints: story.checkpoints.length,
      cash: game.cash,
      shares: game.shares,
      marketValue,
      unrealizedPnl,
      transactions: game.transactions,
    };
  }

  hasActiveGame(): boolean {
    return this.store.game !== null;
  }

  private buildScorecard(story: Story, game: StoryGameState): Scorecard {
    const finalNetValue = game.cash; // shares already liquidated
    const totalGain = finalNetValue - story.startingCash;
    const gainPercent = (totalGain / story.startingCash) * 100;

    // Buy-and-hold: buy max shares at first checkpoint, sell at last
    const firstPrice = story.checkpoints[0].price;
    const lastPrice = story.checkpoints[story.checkpoints.length - 1].price;
    const byhShares = Math.floor(story.startingCash / firstPrice);
    const byhFinalValue = story.startingCash - byhShares * firstPrice + byhShares * lastPrice;
    const byhGainPercent = ((byhFinalValue - story.startingCash) / story.startingCash) * 100;

    const tradeCount = game.transactions.filter((t) => t.action !== "skip").length;

    return {
      storyTitle: story.title,
      ticker: story.ticker,
      startingCash: story.startingCash,
      finalNetValue,
      totalGain,
      gainPercent,
      buyAndHold: { finalValue: byhFinalValue, gainPercent: byhGainPercent },
      tradeCount,
    };
  }
}
