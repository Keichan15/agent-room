#!/usr/bin/env python3
"""index.html（静的版）から localhost版の部屋ページ room.html を生成する。

静的版の見た目・移動・ギミックのエンジンはそのままに、
- おちゃの固定タスクを空にし、サーバー報告で上書きされる前提にする
- サンプルのサブエージェントを、共通設定の外部AIキャストに差し替える
- /api/state を2秒ごとに取得して tasks を実報告で更新する live sync を注入する

使い方: python3 local/make-room.py   （agent-room/ 直下でも local/ からでも可）
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "index.html"
DST = pathlib.Path(__file__).resolve().parent / "room.html"

html = SRC.read_text(encoding="utf-8")


def replace_once(pattern, repl, text, flags=0, count=1):
    new, n = re.subn(pattern, repl, text, count=count, flags=flags)
    if n != count:
        sys.exit(f"replacement failed ({n} != {count}): {pattern[:60]}")
    return new


# 1) タイトル
html = replace_once(
    r"<title>エージェント可視化の試作</title>",
    "<title>Agent Room（localhost版）</title>",
    html,
)

# 2) おちゃの固定データを live 前提のプレースホルダに
html = replace_once(
    r'statusLabel: "対応中 ・ あなたの返信待ちの件あり",',
    'statusLabel: "localhost連携 ・ 報告待ち",',
    html,
)
html = replace_once(
    r"bubbleLines: \[.*?\]",
    'bubbleLines: [\n          "サーバーからの報告を待っています"\n        ]',
    html,
    flags=re.DOTALL,
)
html = replace_once(r"tasks: \[.*?\]", "tasks: []", html, flags=re.DOTALL)

# 3) サブエージェントのプールを外部AIキャストに差し替え
subpool_new = '''      var subPool = [
        { id: "claude-code", name: "Claude Code", role: "外部AI（Claude Code）", color: "#d97757", accessory: "glasses", outfit: "#8a5a44" },
        { id: "codex", name: "Codex", role: "外部AI（Codex）", color: "#4a6fa5", accessory: "cap", outfit: "#2f3e55" },
        { id: "chatgpt", name: "ChatGPT", role: "外部AI（ChatGPT）", color: "#10a37f", accessory: "star", outfit: "#0b6e55" },
        { id: "gemini", name: "Gemini", role: "外部AI（Gemini）", color: "#7b8cff", accessory: "ribbon", outfit: "#4a5aa8" }
      ];
      var taskPool = [];'''
html = replace_once(
    r"      var subPool = \[.*?\n      \];\n      var taskPool = \[.*?\n      \];",
    subpool_new,
    html,
    flags=re.DOTALL,
)

# 4) makeSub を live 用（タスクなし・重複IDガード付き）に差し替え
makesub_new = '''      var usedAgentIds = { ocha: true };
      function makeSub(def, deskIdx) {
        var id = def.id || ("sub-" + def.name);
        if (usedAgentIds[id]) { var n = 2; while (usedAgentIds[id + "-" + n]) n++; id = id + "-" + n; }
        usedAgentIds[id] = true;
        return {
          id: id,
          name: def.name, main: false, badge: "外部", role: def.role,
          color: def.color, accessory: def.accessory, outfit: def.outfit,
          x: desks[deskIdx].x, y: desks[deskIdx].y,
          home: { x: desks[deskIdx].x, y: desks[deskIdx].y },
          status: "idle", statusLabel: "待機中",
          bubbleLines: ["待機中です"],
          tasks: []
        };
      }
'''
html = replace_once(
    r"      function makeSub\(def, deskIdx\) \{.*?\n      \}\n",
    makesub_new,
    html,
    flags=re.DOTALL,
)

# 5) 初期キャストは外部AI 3体
html = replace_once(
    r"for \(var i = 0; i < 4; i\+\+\) agents\.push\(makeSub\(subPool\[i\], \[0, 2, 3, 4\]\[i\]\)\);",
    "for (var i = 0; i < 3; i++) agents.push(makeSub(subPool[i], [0, 2, 3][i]));",
    html,
)

# 6) 非メインのバッジをエージェントごとの表示に
html = html.replace(
    "'<span class=\"badge-sub\">サブ</span>'",
    "'<span class=\"badge-sub\">' + (a.badge || \"サブ\") + '</span>'",
)

# 7) 詳細パネルの注記を localhost版の文言に
html = replace_once(
    r"おちゃ本人の仕事リストです（2026年11月10日時点の実際の状況）。サブエージェントの表示と区別するため、金色の「メイン」バッジが付いています。",
    "おちゃ本人の仕事リストです（localhostサーバー経由の実報告）。金色の「メイン」バッジが付いています。",
    html,
)
html = replace_once(
    r"このサブエージェントの仕事は、試作用のサンプル表示です。実際に動かすときは、ここに本物のタスクが流れます。",
    "このエージェントの仕事は、localhostサーバー経由の実報告です。報告がない間は日常生活モードで過ごします。",
    html,
)

# 8) 初期ログの種（当時の実作業ログ）を localhost版の文言に
html = replace_once(
    r'      addLog\("おちゃ：丸八製菓様の帰りの新幹線候補（直通・乗り換え案）を提示しました", true\);\n'
    r'      addLog\("おちゃ：大溝さんへのリスト共有状況の確認が完了しました", true\);\n'
    r'      addLog\("おちゃ：明日の朝会に向けた準備をはじめました", true\);\n'
    r'      addLog\("さくら：調査タスクを受け取りました", false\);',
    '      addLog("おちゃ：localhost版のお部屋が開きました。報告を待っています", true);',
    html,
)

# 9) サブエージェントの自動進行シミュレーションを無効化
#    （実報告のタスクを勝手に進めたり、サンプルタスクを生やしたりしないため）
html = replace_once(
    r"      /\* ============ simulation \(sub-agents only\) ============ \*/\n"
    r"      setInterval\(function \(\) \{.*?\n      \}, 1400\);",
    "      /* localhost版ではシミュレーションなし：タスクはサーバー報告でのみ変化する */",
    html,
    flags=re.DOTALL,
)

# 10) live sync を最後の </script> の直前に注入
sync = '''
      /* ============ live sync (localhost版) ============
         local/server.mjs の /api/state を2秒ごとに取得し、
         共通フォーマット（SPEC.md）の報告を各エージェントの tasks に反映する。 */
      var liveConnected = false;
      var liveBar = document.createElement("div");
      liveBar.style.cssText = "position:fixed;top:8px;right:8px;z-index:200;background:#14141f;color:#fff;border:2px solid #55556e;border-radius:4px;padding:4px 10px;font-size:12px;font-weight:700;";
      liveBar.textContent = "○ サーバー未接続（表示のみ）";
      document.body.appendChild(liveBar);
      var liveStateMap = { working: "work", waiting: "wait", queued: "queued", done: "done" };
      var liveLabelMap = { working: "進行中", waiting: "待ち", queued: "予定", done: "完了" };
      function applyLive(snap) {
        var changed = false;
        agents.forEach(function (a) {
          var tasks = (snap.tasks || []).filter(function (t) { return t.agentKey === a.id; }).map(function (t) {
            return { title: t.title, note: t.detail || "", state: liveStateMap[t.state] || "queued", label: liveLabelMap[t.state] || "", progress: t.progress || 0 };
          });
          var j = JSON.stringify(tasks);
          if (a._liveJson !== j) {
            a._liveJson = j;
            a.tasks = tasks;
            changed = true;
            var cur = tasks.filter(function (t) { return t.state === "work"; })[0];
            if (a.main) a.bubbleLines = [cur ? cur.title + "中" : "待機中です"];
          }
        });
        if (changed) { renderDetail(); renderMembers(); syncDots(); refreshBubbles(); }
      }
      function pollLive() {
        fetch("/api/state", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (snap) {
          if (!liveConnected) { liveConnected = true; liveBar.textContent = "● LIVE（localhost連携中）"; addLog("localhostサーバーに接続しました", false); }
          applyLive(snap);
        }).catch(function () {
          if (liveConnected) { liveConnected = false; liveBar.textContent = "○ サーバー未接続（表示のみ）"; }
        });
      }
      setInterval(pollLive, 2000);
      pollLive();
'''
idx = html.rfind("</script>")
if idx < 0:
    sys.exit("no </script> found")
html = html[:idx] + sync + html[idx:]

DST.write_text(html, encoding="utf-8")
print(f"wrote {DST} ({len(html)} bytes)")
