import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "../utils.js";

const STORE_PATH = path.join(CONFIG_DIR, "storymode.json");

export interface StoryTransaction {
  checkpointId: string;
  action: "buy" | "sell" | "skip";
  quantity?: number;
  price?: number;
  date: string;
}

export interface StoryGameState {
  storyId: string;
  currentCheckpointIndex: number;
  cash: number;
  shares: number;
  transactions: StoryTransaction[];
  startedAt: string;
}

export interface StoryStoreFile {
  version: 1;
  game: StoryGameState | null;
}

function emptyStore(): StoryStoreFile {
  return { version: 1, game: null };
}

export async function loadStoryStore(): Promise<StoryStoreFile> {
  try {
    const raw = await fs.promises.readFile(STORE_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return {
        version: 1,
        game:
          record.game && typeof record.game === "object" ? (record.game as StoryGameState) : null,
      };
    }
    return emptyStore();
  } catch (err) {
    if ((err as { code?: unknown })?.code === "ENOENT") {
      return emptyStore();
    }
    throw err;
  }
}

export async function saveStoryStore(store: StoryStoreFile): Promise<void> {
  await fs.promises.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const json = JSON.stringify(store, null, 2);
  await fs.promises.writeFile(tmp, json, "utf-8");
  await fs.promises.rename(tmp, STORE_PATH);
  try {
    await fs.promises.copyFile(STORE_PATH, `${STORE_PATH}.bak`);
  } catch {
    // best-effort
  }
}
