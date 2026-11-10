# Agent Room — localhost版

静的版（`../index.html`）と同じドット絵の部屋を、自分のPCやミニPCの
localhost で動かし、**実際の作業報告でリアルタイムに更新**できる版です。

Claude Code に移植する用途を想定しています：Claude Code のフックから
報告を送ると、部屋の中の「Claude Code」がそのタスクを表示します。
報告フォーマットは共通仕様（`../SPEC.md` / `../agent-room.config.json`）と
同じなので、Codex や他のツールからも同じ方法で参加できます。

## 構成

| ファイル | 役割 |
|---|---|
| `server.mjs` | 依存なしの小さなサーバー。部屋の配信・報告の受付・状態保持（`state.json`） |
| `room.html` | 部屋ページ。`make-room.py` が静的版から生成。2秒ごとに `/api/state` を取得 |
| `report.mjs` | 報告CLI。どのツールからでも `node report.mjs ...` で報告できる |
| `claude-code.hooks.json` | Claude Code のフック設定例 |
| `make-room.py` | `../index.html` から `room.html` を再生成するスクリプト |

## 起動

```bash
node local/server.mjs
# → http://localhost:4310 をブラウザで開く
```

ポートは環境変数 `PORT` で変更できます。サーバーは 127.0.0.1 のみに
バインドします。**認証はないので、外部に公開しないでください。**
状態は `state.json` に保存され、再起動しても残ります
（リセットは `POST /api/reset`）。

## 報告のしかた

```bash
# 作業開始
node local/report.mjs --agent claude-code --title "認証のバグ修正" --state working

# 進捗・完了
node local/report.mjs --agent claude-code --title "認証のバグ修正" --state working --progress 60
node local/report.mjs --agent claude-code --title "認証のバグ修正" --state done
```

初回報告のときだけ `--name "Claude Code" --provider claude --kind external`
を付けると、そのエージェントが部屋に登録されます。
`curl` で直接叩いても構いません（`POST http://127.0.0.1:4310/api/report` に
報告フォーマットのJSONを送る）。

## Claude Code への組み込み

1. このリポジトリを手元に置く（clone など）
2. `claude-code.hooks.json` の内容を、Claude Code の `settings.json` の
   `hooks` にマージする（パスは自分の環境に合わせて書き換える）
3. `node local/server.mjs` を起動しておく（ミニPCで常駐させる想定）
4. Claude Code を使うと、セッション開始・依頼受付・応答終了のタイミングで
   部屋の「Claude Code」に状態が表示される

応用：`UserPromptSubmit` のフックは標準入力で依頼文（prompt）を含むJSONを
受け取ります。`jq` 等で prompt を取り出して `--title` に渡せば、
「何のタスクをしているか」まで部屋に出せます。

## 注意

- 部屋のキャスト（おちゃ／Claude Code／Codex／ChatGPT）は `room.html`
  生成時点のもの。表示名や色は `../agent-room.config.json` と
  `make-room.py` のキャスト定義に合わせています。
- 報告がないエージェントは、静的版と同じく日常生活ギミックで過ごします。
- `room.html` を作り直したら `python3 local/make-room.py` で再生成してください。
