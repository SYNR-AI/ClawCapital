import { Type } from "@sinclair/typebox";
import { getStoryService } from "../../storymode/index.js";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readNumberParam, readStringParam } from "./common.js";

const STORY_ACTIONS = ["list", "start", "action", "status"] as const;
const TRADE_ACTIONS = ["buy", "sell", "skip"] as const;

const StoryModeToolSchema = Type.Object({
  action: stringEnum(STORY_ACTIONS),
  storyId: Type.Optional(Type.String({ description: "Story ID (required for start)" })),
  tradeAction: Type.Optional(
    stringEnum(TRADE_ACTIONS, { description: "Trade action (required for action)" }),
  ),
  quantity: Type.Optional(
    Type.Number({ description: "Number of shares. Omit for all-in buy or sell-all." }),
  ),
});

export function createStoryModeTools(): AnyAgentTool {
  return {
    label: "Story Mode",
    name: "storymode",
    description:
      "Play historical trading scenarios. Actions: list (available stories), start (begin a story), action (buy/sell/skip at current checkpoint), status (current game state).",
    parameters: StoryModeToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const engine = await getStoryService();

      if (action === "list") {
        return jsonResult({ stories: engine.listStories() });
      }

      if (action === "start") {
        const storyId = readStringParam(params, "storyId", { required: true });
        const result = await engine.startStory(storyId);
        return jsonResult(result);
      }

      if (action === "action") {
        const tradeAction = readStringParam(params, "tradeAction", { required: true });
        if (!TRADE_ACTIONS.includes(tradeAction as (typeof TRADE_ACTIONS)[number])) {
          throw new Error(
            `Invalid tradeAction: ${tradeAction}. Must be one of: ${TRADE_ACTIONS.join(", ")}`,
          );
        }
        const quantity = readNumberParam(params, "quantity", { integer: true });
        const result = await engine.executeAction(tradeAction as "buy" | "sell" | "skip", quantity);
        return jsonResult(result);
      }

      if (action === "status") {
        const result = engine.getStatus();
        return jsonResult(result);
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
