// Agent Room — localhost サーバー（依存なし / Node 18+）
//
// 役割:
//   - 部屋ページ（room.html）を配信する
//   - エージェントからの報告（共通フォーマット: SPEC.md）を受けて状態を保持する
//   - 部屋ページに /api/state で最新状態を返す
//
// 起動: node local/server.mjs   （PORT 環境変数で変更可、既定 4310）
// 状態は local/state.json に保存され、再起動しても残ります。
// 127.0.0.1 のみにバインドします。認証はありません。外部に公開しないでください。

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(DIR, "state.json");
const PORT = Number(process.env.PORT || 4310);

const PROVIDER_DEFAULTS = {
  muse: { color: "#5da653", outfit: "#2ec4b6" },
  claude: { color: "#d97757", outfit: "#8a5a44" },
  chatgpt: { color: "#10a37f", outfit: "#0b6e55" },
  codex: { color: "#4a6fa5", outfit: "#2f3e55" },
  gemini: { color: "#7b8cff", outfit: "#4a5aa8" },
  other: { color: "#9a9a9a", outfit: "#5a5a5a" },
};
const TASK_STATES = ["working", "waiting", "queued", "done"];

let state = { agents: [], tasks: [], log: [] };

async function seedFromConfig() {
  // リポジトリ直下の共通設定があれば、その agents を初期キャストにする
  try {
    const cfg = JSON.parse(
      await readFile(path.join(DIR, "..", "agent-room.config.json"), "utf8")
    );
    for (const a of cfg.agents || []) {
      state.agents.push({
        key: a.key,
        name: a.name,
        kind: a.kind || "external",
        provider: a.provider || "other",
        color: a.color || "",
        outfit: a.outfit || "",
        accessory: a.accessory || "",
        lastSeenAt: null,
      });
    }
  } catch {
    /* 共通設定がなくても動く */
  }
  if (!state.agents.length) {
    state.agents.push({
      key: "ocha", name: "おちゃ", kind: "main", provider: "muse",
      color: "#5da653", outfit: "#2ec4b6", accessory: "leaf", lastSeenAt: null,
    });
  }
}

async function load() {
  if (existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(await readFile(STATE_FILE, "utf8"));
      return;
    } catch {
      /* 壊れていたら初期化する */
    }
  }
  await seedFromConfig();
}

let saveQueued = false;
async function save() {
  if (saveQueued) return;
  saveQueued = true;
  queueMicrotask(async () => {
    saveQueued = false;
    try {
      await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    } catch {
      /* 保存失敗は致命ではない */
    }
  });
}

function addLog(agentKey, agentName, message, kind) {
  state.log.unshift({
    agentKey, agentName, message,
    kind: kind || "info",
    createdAt: new Date().toISOString(),
  });
  state.log = state.log.slice(0, 50);
}

function applyReport(rep) {
  const key = String(rep.agentKey || "").trim();
  if (!key) return { error: "agentKey is required" };
  let agent = state.agents.find((a) => a.key === key);
  if (!agent) {
    const d = PROVIDER_DEFAULTS[rep.provider] || PROVIDER_DEFAULTS.other;
    agent = {
      key,
      name: rep.name || key,
      kind: rep.kind || "external",
      provider: rep.provider || "other",
      color: rep.color || d.color,
      outfit: rep.outfit || d.outfit,
      accessory: rep.accessory || "",
      lastSeenAt: null,
    };
    state.agents.push(agent);
  }
  if (rep.name) agent.name = rep.name;
  agent.lastSeenAt = new Date().toISOString();

  const taskState = TASK_STATES.includes(rep.taskState) ? rep.taskState : "working";
  if (rep.taskTitle) {
    let task = state.tasks.find(
      (t) => t.agentKey === key && t.title === rep.taskTitle && t.state !== "done"
    );
    if (!task) {
      task = {
        agentKey: key,
        title: rep.taskTitle,
        detail: "",
        state: taskState,
        progress: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.tasks.push(task);
    }
    task.state = taskState;
    if (rep.taskDetail != null) task.detail = String(rep.taskDetail);
    if (rep.progress != null) {
      task.progress = Math.max(0, Math.min(100, Number(rep.progress) || 0));
    }
    if (taskState === "done") task.progress = 100;
    task.updatedAt = new Date().toISOString();
    // 1エージェントのタスクは直近10件まで（完了した古いものから落とす）
    const mine = state.tasks.filter((t) => t.agentKey === key);
    if (mine.length > 10) {
      const drop = mine.filter((t) => t.state === "done").slice(0, mine.length - 10);
      state.tasks = state.tasks.filter((t) => !drop.includes(t));
    }
  }
  addLog(
    key,
    agent.name,
    rep.message || `${agent.name}：${rep.taskTitle || "状態を更新"}（${taskState}）`,
    taskState === "done" ? "done" : "work"
  );
  return { ok: true };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/room.html")) {
      const html = await readFile(path.join(DIR, "room.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, {
        agents: state.agents,
        tasks: state.tasks,
        log: state.log,
        serverNow: new Date().toISOString(),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/report") {
      const rep = JSON.parse(await readBody(req) || "{}");
      const result = applyReport(rep);
      await save();
      sendJson(res, result.error ? 400 : 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/reset") {
      state = { agents: [], tasks: [], log: [] };
      await seedFromConfig();
      await save();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 404, { error: "not found" });
  } catch (e) {
    sendJson(res, 500, { error: String(e && e.message || e) });
  }
});

await load();
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Agent Room (localhost) → http://localhost:${PORT}`);
  console.log("報告の送り先: POST /api/report （詳細は local/README.md）");
});
