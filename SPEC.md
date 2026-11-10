# Agent Room 共通化仕様（SPEC）

どのAIツールでも、同じ約束ごとで Agent Room にキャラクターとして参加し、
「いま何のタスクをしているか」を部屋に表示できるようにするための共通仕様です。
設定値は `agent-room.config.json` にあります。

## 考え方

- 部屋は「表示」だけを担当する。各AIは自分の状態を **報告（report）** する。
- 報告フォーマットさえ共通なら、出す側が Muse でも Claude Code でも
  ChatGPT でも Codex でも、部屋側は同じように描ける。
- 作業がないエージェントは日常生活ギミック（お風呂・料理・食事・お出かけ等）で
  過ごし、作業が報告された瞬間に作業表示へ切り替わる。
- 最終報告から一定時間（既定15分）報告がなければ「連絡なし」と表示し、
  古い情報を新しいもののように見せない。

## エージェント定義

`agent-room.config.json` の `agents[]` に1エージェント1件で定義する。

| フィールド | 意味 |
|---|---|
| `key` | 一意キー（報告時の `agentKey` と一致させる） |
| `name` | キャラの表示名 |
| `kind` | `main`（部屋の主）/ `sub`（委任されたサブ）/ `external`（外部AI） |
| `provider` | `muse` / `claude` / `chatgpt` / `codex` / `gemini` / `other` |
| `color` / `outfit` / `accessory` | ドット絵の色・小物（任意。省略時は provider の既定色） |

## 報告フォーマット

エージェントは作業の開始・進捗・完了のたびに、次を報告する
（JSONの形は `agent-room.config.json` の `reportFormat` を参照）。

- `agentKey`（必須）、`taskTitle`、`taskState`、`progress`、`taskDetail`、`message`
- `taskState` は `working`（作業中）/ `waiting`（待ち）/ `queued`（順番待ち）/
  `done`（完了）のいずれか
- 初回報告時のみ `name` / `kind` / `provider` を付ければ、その場で
  エージェントが部屋に登録される（事前定義がなくても参加できる）

## ツール別のつなぎ方

- **Muse（おちゃ）**: 本運用版の部屋に対して、作業の開始・終了・委任のたびに
  報告アクションを呼ぶ。すでにこの方式で運用中。
- **Claude Code**: セッション開始／タスク開始／終了のタイミングで、
  フック（hooks）やラッパースクリプトから報告フォーマットのJSONを
  書き出す／送信する。`provider` は `claude`、`kind` は `external`。
- **Codex**: 実行をラップするスクリプトで開始時と終了時に報告する。
  `provider` は `codex`、`kind` は `external`。
- **ChatGPT**: 常駐プロセスではないため、(a) GPTs の Actions から報告先を叩く、
  (b) 作業を依頼した側（Muse など）が代理で報告する、のいずれか。
  `provider` は `chatgpt`、`kind` は `external`。
- **その他**: 報告フォーマットに沿ったJSONを出せるものなら何でも参加できる。

## 静的版（index.html）での使い方

`index.html` 内のエージェント／タスクのデータ定義を、この共通設定の
`agents[]` に合わせて差し替えると、同じ顔ぶれ・同じ色で部屋に並びます。
実状態と連動させる場合は、データ定義を報告フォーマットの最新状態で
置き換えるのが拡張ポイントです。
