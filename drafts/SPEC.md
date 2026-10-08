# Draft spec: usage-limit skip catch-up

**Status: draft. Do not build until the owner says build.**

This file is the contract for a future change. `demo/catch-up-engine.js` is a reference simulation of the same rules. Neither one is wired to Grok Bot. The live product grade is FAIL (`RECEIPT.md`). Shipping this draft does not clear that grade.

Out of scope, and not specified here:

- The missed-wake catch-up for a fire that never started
- The owner gate "run only when usage is under X%" and its alerts, except that a catch-up must honor that gate at start time
- Usage breakdowns by bot, category, chat, or routine
- The size of the weekly pool, a new paid plan, or on-demand overflow
- Install, download, and account-link issues

## 1. Record the blocked fire

When a scheduled fire is blocked because the usage limit is hit, append one history row on that routine:

- Label: `Skipped — usage limit`
- Slot: local calendar date and minute in the routine's schedule time zone (`CRON_TZ`), `YYYY-MM-DD HH:mm <tz>`
- Reset time seen: the same clock fields from the limit signal, or `unknown` when the signal has no reset time

Do not run the instruction. Do not deliver a report.

If the routine is paused or the computer is down, the row is `Skipped — paused` or `Skipped — computer down` instead, even if the limit is also hit. Those rows are not eligible for catch-up.

If usage is available and the owner gate is false, the row is `Skipped — owner gate false`. That row is not eligible for catch-up.

If the limit is what blocked the fire, the row is the usage-limit row even when the gate would also have been false at 100% usage. The gate is evaluated again at catch-up start.

## 2. Owner setting

Name: **Catch up after usage resets**

| Stored value | Owner label | Queue rule |
| --- | --- | --- |
| `off` | Off | Do not queue. History note: `Not queued — catch-up off`. |
| `latest` | Latest skipped run only | Queue the newest open usage-limit skip. Note the rest `Dropped — latest skipped run only`. |
| `each` | Each skipped slot (up to 3) | Queue up to 3 newest open usage-limit skips. Note the rest `Dropped — cap of 3 skipped slots`. |

Existing routines store `off`. Enabling the setting without an explicit mode stores `latest`.

The cap `3` and the labels above are part of this draft.

## 3. When usage becomes available

Signals:

- `weekly_reset`
- `plan_top_up`
- `owner_raised_limit`

On a signal, build one global queue for every bot:

1. Consider skips whose cause is `usage_limit` and whose status is `open` or `held`.
2. Drop deleted routines (`Dropped — routine deleted`) and paused routines (`Dropped — routine paused`).
3. If catch-up is off, waive the open skips for this signal (`Not queued — catch-up off`).
4. If the next normal fire is `>= signal time` and `<= signal time + 15 minutes`, mark those skips `superseded by scheduled run` and do not queue them. A fire in the past does not supersede.
5. Apply `latest` or `each` from the setting's current value.
6. Sort the queue by slot time, then bot name, then routine name.
7. Assign start times `signal`, `signal + 90s`, `signal + 180s`, and so on. One start at a time. The gap is global, not per bot.

`90` seconds is the draft stagger. `15` minutes is the supersede window from the request.

## 4. At each catch-up start, read the routine again

In order:

1. Deleted → `Dropped — routine deleted`. Do not run the stored prompt.
2. Paused → `Dropped — routine paused`.
3. Catch-up turned off → `Dropped — catch-up turned off`.
4. Computer down → `Not run — computer unavailable`. Status stays `held`. Do not mark done. Do not start it again in this wave.
5. Owner gate false at the current usage percent → `Not run — owner gate false`. Do not deliver.
6. Usage limit closed again → `Catch-up held — usage limit` on the **same** slot. Increment attempts. Do not mark done. Do not re-queue until a later availability signal.
7. Otherwise run the **current** instruction (the prompt version now, including edits made after the skip).

Delivery:

- Title and history label: `Catch-up for <original slot>`
- Same delivery path as a normal run of that routine
- NONE plus a stay-quiet instruction: post nothing, history detail `Stayed quiet on NONE.`, status `done`
- A run that should have posted and produced no report: `Catch-up incomplete — no report`, status `held`, not `done`

A `done` skip is not queued again. A second drain of the same queue does not start a skip that is already `held` or `done`.

## 5. Unknown reset time

Store `unknown`. Do not invent a reset instant from the day of the week. Moving the clock does not start the catch-up. The next real availability signal does.

## 6. Acceptance mapped to the failure cases

A build matches this draft only when a simulator or a staged account shows:

1. A usage-limit block writes `Skipped — usage limit` with slot and reset time, and delivers nothing.
2. `off` (the existing-routine default) does not run after the signal. `latest` runs one labeled catch-up.
3. Starts across routines and bots are 90 seconds apart. The cap of 3 drops the older slots.
4. A next fire inside the 15-minute window writes `superseded by scheduled run` and does not also deliver.
5. Paused, computer-down, and gate-false skips do not catch up. A usage-limit skip still loses to a gate that is false at start time.
6. A catch-up blocked by the limit stays `held`, is not marked done, and does not spin. The next signal runs it once.
7. The report title is the skipped slot. Quiet NONE posts nothing and says so.
8. `unknown` does not synthesize a timer. A later raise-limit signal still catches up once.
9. Delete and pause after queueing do not run. An edit runs the new prompt and keeps the original slot label.
