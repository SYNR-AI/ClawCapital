import { StoryEngine } from "./story-engine.js";

export { StoryEngine } from "./story-engine.js";
export type { ActionResult, Scorecard, StatusResult } from "./story-engine.js";
export type { Story, Checkpoint } from "./stories/googl-2025-q3.js";
export type { StoryGameState, StoryTransaction } from "./story-store.js";

let servicePromise: Promise<StoryEngine> | null = null;

export function getStoryService(): Promise<StoryEngine> {
  if (!servicePromise) {
    servicePromise = StoryEngine.create();
  }
  return servicePromise;
}
