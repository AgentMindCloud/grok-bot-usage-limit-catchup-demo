# Catch up a routine after a usage limit

**Draft.** This article is not in the Grok Bot help center. It describes a behavior the owner has not approved to build. The live product grade for this behavior is FAIL. See `RECEIPT.md`.

A routine can miss its slot when the account is out of included usage and on-demand is not available. This article is about that miss only. It is not about a routine that never woke, a routine you paused, a usage-headroom gate, or a computer that could not be reached.

## What gets written when the limit blocks a fire

The fire does not run, and it does not post a report. The routine's history gains one row:

**Skipped — usage limit**

The row includes:

- The slot, as the local date and minute in the routine's time zone. Example: `2026-10-09 08:00 America/Phoenix`.
- The reset time on the limit signal, in that same time zone. If the signal has no reset time, the row says `unknown`.

Phone and desktop both show that row. It is not the same as Running, Succeeded, or Failed.

## Catch up after usage resets

Each routine has a setting, **Catch up after usage resets**.

| Value | What happens after usage is available again |
| --- | --- |
| Off | Nothing queued. The skip stays in history. The routine waits for its next normal slot. |
| Latest skipped run only | One catch-up, for the newest usage-limit skip still open. Older usage-limit skips stay in history and do not run. |
| Each skipped slot (up to 3) | One catch-up per open usage-limit skip, newest first, at most 3. Older ones stay in history and do not run. |

Existing routines are **Off**. When you turn catch-up on and do not pick a mode, it is **Latest skipped run only**.

Usage becomes available on any of these signals:

- The weekly reset
- A plan top-up
- You raise the limit

A catch-up runs once for the slot it names. The history label is **Catch-up for** followed by the original slot, for example `Catch-up for 2026-10-09 08:00 America/Phoenix`. The report uses that same title. It does not use the clock time of the day it actually runs.

The report goes out the way that routine already delivers. If the instruction says to stay quiet when there is nothing to report, a NONE result stays quiet. History still records the catch-up and says it stayed quiet on NONE. That quiet result is complete. A catch-up that should have posted a report and produced nothing is not marked done.

## When the catch-up is dropped

At the moment usage becomes available, the next normal fire can replace the catch-up. If that fire is at the same moment, earlier in the future, or within 15 minutes, history says **superseded by scheduled run** and no catch-up report is sent.

These skips never catch up:

- **Skipped — paused**
- **Skipped — computer down**
- **Skipped — owner gate false**

A usage-headroom gate is checked again when the catch-up is about to start, not only when the slot was skipped. If usage is no longer under the gate, history says **Not run — owner gate false** and no report is sent.

If you pause or delete the routine after the skip, the queued catch-up is dropped. History says **Dropped — routine paused** or **Dropped — routine deleted**. The prompt from the skipped day is not run.

If you edit the instruction, the catch-up runs the instruction that is current when it starts. The history and the report still name the original slot.

## Many routines at once

Catch-ups wait in one queue across your bots. They start 90 seconds apart. They do not all start at the reset.

If the catch-up itself is blocked by the usage limit, history says **Catch-up held — usage limit** for the same slot. That row is not a success. The slot is not marked done, and it is not started again until a later availability signal.

If the reset time on the skip is unknown, the scheduler does not invent one. The skip stays visible. The catch-up runs when a weekly reset, a plan top-up, or a raised limit actually arrives.

## What this does not change

Catch-up does not add usage, change the weekly pool, or bill a new plan. A catch-up spends usage the same way a normal run of that routine spends it. Test still spends usage, because Test does the work.
