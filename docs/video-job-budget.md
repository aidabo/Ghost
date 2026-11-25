# 動画の job の費用の上限（Ghost で数える）

計画: front の `docs/planning/video-job-runner-plan.md` 7.1（1 job 3 USD・テナントの月 30 USD）。
Ghost 1 つが 1 テナントなので、「テナントの月の合計」はこの DB の動画の job の合計。

## 決めたこと

| こと | 決め |
|---|---|
| 月の区切り | **サイトの時間帯**（Ghost の設定 `timezone`）の `YYYY-MM`。読めない時間帯なら UTC |
| 月の上限 | env `VIDEO_JOB_MONTHLY_MAX_COST_USD`（既定 30。空は既定、0 は有料の job を受けない） |
| 1 job の上限 | env `VIDEO_JOB_MAX_COST_USD`（既定 3、前から） |
| 金額の持ち方 | micro USD の整数（1 USD = 1,000,000）。API は USD |
| 上限ちょうど | 通す（超えたら断る） |

## job が持つもの（`social_ai_video_jobs`）

| 列 | 中身 |
|---|---|
| `cost_month` | 費用を数える月 |
| `cost_estimate_micros` | 受け付けの見込み（作り置きを見ない上限） |
| `cost_reserved_micros` | 予約（受け付けで見込みと同じ、のち worker が予約し直す） |
| `cost_actual_micros` | worker が知らせた実際（null = まだ） |

月に数える額: 開いた job（queued・running）は「予約と実際の大きい方」、終わった job は「実際（無ければ予約）」。
だれも取っていない queued の job を取り消したら予約は 0 に戻る（同意の取り消しで止めた job も同じ）。
送った後の取り消しは有料なので、running の job は取り消しても予約が残る。

この列を足す前の job は `cost_month` が無く、どの月にも数えない。

## 見込み（受け付けのとき）

- 声: 行の数 × `VIDEO_JOB_VOICE_LINE_COST_USD`（既定 0.002、仮）
- 顔（`avatar.lipsync: true`）: **口を動かす声の秒数** × `VIDEO_JOB_FACE_SECOND_COST_USD`（既定 0.02、仮。worker と同じ名前）。
  worker は声を 12〜15 秒のかたまりにして Wan3 に送るので、行ではなく秒で数える。
- 受け付けのときは声がまだ無いので、秒は字数から見積もる（多めに、切り上げ）:

| `lang` | 1 秒の字数（tempo 1） |
|---|---|
| ja | 7 |
| zh | 4.5 |
| ko | 6 |
| ほか（英語など。空白・句読点も数える） | 14 |

  tempo が遅いほど秒が増える（字数 ÷（目安 × tempo））。

## API

| 道 | だれ | 中身 |
|---|---|---|
| `POST /social/ai/video/jobs`（受け付け） | スタッフ | 月の合計＋見込み > 上限なら 422 `VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED` |
| `POST /social/ai/video/jobs/:id/reserve-cost` | worker（lease を持つ者） | body `{claim_*, total_usd, cost_usd?}`。下を見る |
| `POST .../complete`・`.../fail` | worker | `cost_usd`（それまでの実際の合計）を付けられる |
| `GET /social/ai/video/budget` | スタッフ・worker | `{month, monthly_max_usd, month_total_usd, remaining_usd}` |

`reserve-cost` は有料の段（とくに顔）を送る前に呼ぶ。`total_usd` は「この段を終えたときの job の費用の合計」
（使った分＋この段、作り置きの行は 0）。同じ値で何度呼んでも同じ答え。

- 1 job の上限を超える → 422 `VIDEO_JOB_BUDGET_EXCEEDED`
- 月の上限を超える → 422 `VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED`。worker はその段を送らず、job を `fail`（`error_code=budget_exceeded`）にする。作り置きは残る
- 下げるのはいつでも通る
- 答え: `{approved, reserved_usd, actual_usd, month, monthly_max_usd, month_total_usd, remaining_usd}`
- 先月に受け付けた job が今月に予約すると、job の費用はまるごと今月に移る

## 同時に来たとき

確かめはどれも 1 つのトランザクションで、先にその月の行（`social_ai_video_cost_months`、月ごとに 1 行、合計は持たない）を
`SELECT … FOR UPDATE` で押さえ、job の合計は `FOR SHARE` で最新を読む。同じ月の確かめは 1 つずつ進むので、2 つ同時でも上限を超えない。

## 本番イメージ

足したファイルは `ghost/core/core/server/api/endpoints/`（utils も）と `migrations/versions/5.116/` の下で、
`.docker/prd.Dockerfile` はどちらもディレクトリごと COPY 済み。`schema.js` も COPY 済み。
