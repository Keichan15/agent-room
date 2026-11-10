#!/usr/bin/env node
// Agent Room — 報告CLI（依存なし / Node 18+）
//
// どのツールからでも、自分の「今のタスク」を部屋に報告するための小さなCLI。
// Claude Code のフック、Codex のラッパー、シェルスクリプトなどから呼ぶ想定。
//
// 使い方:
//   node local/report.mjs --agent claude-code --title "認証のバグ修正" --state working
//   node local/report.mjs --agent claude-code --title "認証のバグ修正" --state done
//   node local/report.mjs --agent codex --title "テスト実行" --state working --progress 40 --detail "3件失敗中"
//
// 初回報告時だけ --name / --provider / --kind を付けるとエージェントが登録されます。
// サーバーURLは環境変数 AGENT_ROOM_URL（既定 http://127.0.0.1:4310）で変更できます。

const BASE = process.env.AGENT_ROOM_URL || "http://127.0.0.1:4310";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.agent || !args.title) {
  console.error("usage: report.mjs --agent <key> --title <task> --state working|waiting|queued|done [--progress N] [--detail TEXT] [--message TEXT] [--name NAME] [--provider muse|claude|chatgpt|codex|gemini|other] [--kind main|sub|external]");
  process.exit(2);
}

const body = {
  agentKey: args.agent,
  taskTitle: args.title,
  taskState: args.state || "working",
};
if (args.progress != null) body.progress = Number(args.progress);
if (args.detail) body.taskDetail = args.detail;
if (args.message) body.message = args.message;
if (args.name) body.name = args.name;
if (args.provider) body.provider = args.provider;
if (args.kind) body.kind = args.kind;

const res = await fetch(`${BASE}/api/report`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`report failed: ${res.status} ${text}`);
  process.exit(1);
}
console.log(`reported: ${args.agent} / ${args.title} / ${body.taskState}`);
