/**
 * Connect to a remote OpenClaw gateway and send a predefined message via chat.send.
 *
 * Message text lives in messages/<id>.md (free-form Markdown).
 * Optional PDF attachments are configured in messages.json.
 *
 * Usage:
 *   node sandbox/send-test-message.mjs           # list all messages
 *   node sandbox/send-test-message.mjs 1         # send message #1
 *   node sandbox/send-test-message.mjs 2         # send message #2 (with PDF)
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import WebSocket from "ws";

const WS_URL = "ws://192.168.8.82:10010/ws";
const TOKEN = "8888";
const SESSION_KEY = "agent:main:main";

// ── Load messages ──
const __dirname = dirname(fileURLToPath(import.meta.url));
const messages = JSON.parse(readFileSync(resolve(__dirname, "messages.json"), "utf-8"));

const msgId = process.argv[2] || null;

/** Read the .md file for a message entry. */
function loadMessageText(id) {
  const mdPath = resolve(__dirname, "messages", `${id}.md`);
  try {
    return readFileSync(mdPath, "utf-8").trim();
  } catch {
    return null;
  }
}

if (!msgId) {
  console.log("Available messages:\n");
  for (const m of messages) {
    const text = loadMessageText(m.id) ?? "(no .md file)";
    const preview = text.split("\n")[0].slice(0, 60);
    const fileTag = m.file ? `  [PDF: ${basename(m.file)}]` : "";
    console.log(`  ${m.id})  ${preview}${fileTag}`);
  }
  console.log("\nUsage: node sandbox/send-test-message.mjs <id>");
  process.exit(0);
}

const selected = messages.find((m) => m.id === msgId);
if (!selected) {
  console.error(
    `message id "${msgId}" not found. Available: ${messages.map((m) => m.id).join(", ")}`,
  );
  process.exit(1);
}
const messageText = loadMessageText(msgId);
if (!messageText) {
  console.error(`messages/${msgId}.md not found`);
  process.exit(1);
}

// ── PDF extraction ──
async function extractPdfText(path) {
  const data = new Uint8Array(readFileSync(path));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join("");
    pages.push(`--- Page ${i} ---\n${text}`);
  }
  return pages.join("\n\n");
}

async function buildMessage() {
  let msg = messageText;
  if (selected.file) {
    console.log(`extracting text from: ${basename(selected.file)} ...`);
    const filePath = resolve(__dirname, selected.file);
    const text = await extractPdfText(filePath);
    console.log(`extracted ${text.length} chars, ${text.split("\n").length} lines`);
    msg += `\n\n<file name="${basename(selected.file)}">\n${text}\n</file>`;
  }
  return msg;
}

// ── WebSocket + RPC ──
const ws = new WebSocket(WS_URL, { maxPayload: 25 * 1024 * 1024 });

function rpcRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const frame = { type: "req", id, method, params };
    console.log(">>>", method, JSON.stringify(params).slice(0, 200));
    ws.send(JSON.stringify(frame));

    function onMsg(raw) {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "res" && msg.id === id) {
          ws.off("message", onMsg);
          if (msg.ok) {
            resolve(msg.payload);
          } else {
            reject(new Error(msg.error?.message ?? "rpc error"));
          }
        }
      } catch {}
    }
    ws.on("message", onMsg);

    setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error(`rpc timeout: ${method}`));
    }, 10_000);
  });
}

ws.on("open", () => console.log("ws open"));
ws.on("close", (code, reason) => console.log("ws closed", code, reason.toString()));
ws.on("error", (err) => console.error("ws error", err.message));

ws.on("message", async (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.type === "event" && msg.event === "connect.challenge") {
    console.log("<<< connect.challenge");
    try {
      const hello = await rpcRequest("connect", {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "gateway-client",
          displayName: "sandbox-test",
          version: "0.0.1",
          platform: process.platform,
          mode: "backend",
        },
        auth: { token: TOKEN },
        role: "operator",
        scopes: ["operator.admin"],
      });
      console.log("<<< hello-ok, connId:", hello?.server?.connId);

      const message = await buildMessage();
      const chatRes = await rpcRequest("chat.send", {
        sessionKey: SESSION_KEY,
        message,
        idempotencyKey: randomUUID(),
      });
      console.log("<<< chat.send result:", JSON.stringify(chatRes));
    } catch (err) {
      console.error("error:", err.message);
    } finally {
      ws.close();
    }
  }
});
