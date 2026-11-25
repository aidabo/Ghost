# 動画の job の費用の上限（Ghost で数える）

計画: front の `docs/planning/video-job-runner-plan.md` 7.1（1 job 3 USD・テナントの月 30 USD）。
Ghost 1 つが 1 テナントなので、「テナントの月の合計」はこの DB の動画の job の合計。

## 使う人向けの上限（画面に出すもの）

使う人に見せる上限は「1 本の長さ」と「月の本数」。ドルの上限は中の守りとしてそのまま残す。
今は env で決める。あとでサービス利用の表から読むので、読む所は `video-job-budget.js` の `serviceLimits()` 1 つにまとめた（差し替えはここだけ）。

| env | 既定 | 超えたら |
|---|---|---|
| `VIDEO_JOB_MAX_SECONDS` | 60 | 受け付けで 422 `VIDEO_JOB_TOO_LONG` |
| `VIDEO_JOB_MONTHLY_MAX_JOBS` | 30（仮） | 受け付けで 422 `VIDEO_JOB_MONTHLY_COUNT_EXCEEDED` |

- **1 本の長さ**は worker の並べ方（front `tools/video-worker/src/templates.js` の `sceneSeconds`）と同じ式で見積もる:
  場面ごとに max（その場面の行の声の秒＋0.6 秒, 見出しと説明を読む秒〔字数×0.12＋1.5〕, 3 秒）、場面の上限 60 秒、その合計を切り上げ。
  声の秒は下の「1 秒の字数」から。job の `estimate.video_seconds` に出る。
- **月の本数**は、queued・running・completed の job と、費用がかかった failed・canceled の job を数える。
  費用 0 の failed・canceled（worker が `cost_usd: 0` を付けて fail した job、取っていない queued の取り消し）は数えない。
  worker が `cost_usd` を付けずに fail すると予約が残るので 1 本に数える。
- 先月の job が今月に予約し直すと（下の `reserve-cost`）、今月の 1 本として数え直す。
- `GET /social/ai/video/budget` は `max_video_seconds`・`monthly_max_jobs`・`month_jobs`・`remaining_jobs` も返す（画面で「今月あと ◯ 本・1 本 1 分まで」）。

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

**job を消しても枠は戻らない**: job（や project）を消す前に、その job が月に数えていた額と本数を月の行
（`social_ai_video_cost_months.removed_cost_micros`・`removed_jobs`）に足してから行を消す。月の使った額・本数は
「今ある job の行の合計＋月の行に残した分」。

**実際の費用は断らない**: worker が `complete`・`fail`・`reserve-cost` で知らせる `cost_usd` は払った額なので、
予約や上限より高くても断らずに記録する（払った事実は消せない）。記録は月の行を押さえた中で行うので、
同じ月の確かめが古い合計で通ることはない。上限を超えたら、その月の以後の受け付けと予約（上げる方）は断る
（費用 0 の job でも）。予約より高い実費が出ないようにするのは worker の役目（`reserve-cost` で先に予約する）。

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
| `POST /social/ai/video/jobs`（受け付け） | スタッフ | 長すぎる → `VIDEO_JOB_TOO_LONG`、月の本数 → `VIDEO_JOB_MONTHLY_COUNT_EXCEEDED`、月の合計＋見込み > 上限 → `VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED`（どれも 422） |
| `POST /social/ai/video/jobs/:id/reserve-cost` | worker（lease を持つ者） | body `{claim_*, total_usd, cost_usd?}`。下を見る |
| `POST .../complete`・`.../fail` | worker | `cost_usd`（それまでの実際の合計）を付けられる |
| `GET /social/ai/video/budget` | スタッフ・worker | `{month, max_video_seconds, monthly_max_jobs, month_jobs, remaining_jobs, monthly_max_usd, month_total_usd, remaining_usd}` |

`reserve-cost` は有料の段（とくに顔）を送る前に呼ぶ。`total_usd` は「この段を終えたときの job の費用の合計」
（使った分＋この段、作り置きの行は 0）。同じ値で何度呼んでも同じ答え。

- 1 job の上限を超える → 422 `VIDEO_JOB_BUDGET_EXCEEDED`
- 月の上限を超える → 422 `VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED`。worker はその段を送らず、job を `fail`（`error_code=budget_exceeded`）にする。作り置きは残る
- 同じ月の中で下げるのは確かめずに通る。月が変わったときは下げる呼び出しでも新しい月で確かめるので、断られることがある
  （例: 11 月に 1 USD で受け付けた job が 12 月に 0.5 USD を予約 → 12 月が満杯なら 422）
- 答え: `{approved, reserved_usd, actual_usd, month, monthly_max_usd, month_total_usd, remaining_usd}`
- 先月に受け付けた job が今月に予約すると、job の費用はまるごと今月に移る

## 同時に来たとき

確かめはどれも 1 つのトランザクションで、先にその月の行（`social_ai_video_cost_months`、月ごとに 1 行）を
`SELECT … FOR UPDATE` で押さえ、job の合計は `FOR SHARE` で最新を読む。同じ月の確かめは 1 つずつ進むので、2 つ同時でも上限を超えない。
実際の費用の記録と job の削除も同じ月の行を押さえる。

## 本番イメージ

足したファイルは `ghost/core/core/server/api/endpoints/`（utils も）と `migrations/versions/5.116/` の下で、
`.docker/prd.Dockerfile` はどちらもディレクトリごと COPY 済み。`schema.js` も COPY 済み。
