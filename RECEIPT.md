# Receipt: Usage-limit skip catch-up for Grok Bot routines

**Verdict: FAIL**

Checked 8 October 2026 against public Grok Bot help, docs, and the changelog (latest listed release v0.68.1, 7 October 2026), plus one public staff reply. No usage pool was spent. No limit was hit on a real account. No reset was watched live. No post, payment, purchase, or account change was made.

Drafts in this project do not clear the FAIL. The page at `demo/index.html` simulates the draft. It is not the live product.

## Ask

A user on X asked whether a routine skipped because the usage limit was hit can automatically catch up, with its report, once the limit resets.

The X API client for this session is not enrolled, and a public fetch of that post hit a bot check, so the post body was not re-read here. The sentence above is the ask this receipt grades.

## What would pass

The live product would need all of these, visible to a second person from the product UI or the public docs alone:

- (a) A usage-limit skip in routine history, with the slot (local date and minute in the routine time zone) and the reset time seen
- (b) Exactly one labeled catch-up after usage returns, delivered on the routine's normal report path
- (c) A near next fire marked superseded, with no second run
- (d) No catch-up for a routine that was paused or failed its owner gate
- (e) Catch-ups queued across routines, not started in one burst
- (f) A second operator can repeat that from the UI and the docs alone

## Cases

| Case | Grade | Why |
| --- | --- | --- |
| 1. Silent loss | **FAIL** | Public help lists run history as Running, Succeeded, or Failed. It does not list `Skipped — usage limit`, a slot, or a reset time. Staff describe routines that came due during a usage block as skipped, and they do not describe a history row for that skip. |
| 2. No catch-up | **FAIL** | Routine controls in help, mobile docs, and the 5 Oct 2026 changelog are Pause, Resume, Test, Edit, and Delete. There is no "Catch up after usage resets" setting. Staff say the scheduled routines were skipped. They describe queued catch-up for ordinary messages, not for those routines. |
| 3. Reset burst | **FAIL** | Nothing in the help, docs, or changelog describes a stagger queue for usage-limit catch-ups. Staff say skipped routines were skipped, and that ordinary messages reply in a batch when usage returns. That batch is the message path. It is not a queued routine catch-up. A live reset was not watched, and the docs already lack the queue. |
| 4. Double run with the next fire | **FAIL** | Help and changelog do not mention `superseded by scheduled run` or a 15-minute window against the next routine fire. The 15-minute remarks on the forum are about busy-time queue delay, which is a different skip. |
| 5. Wrong cause | **FAIL** | There is no usage-limit catch-up in the public docs, so there is no rule that keeps paused, gate, and computer-down skips out of one. Pause and delete do cancel runs that were already waiting (changelog, 3 Sep 2026). That is the waiting-run queue, not a usage-limit catch-up. An owner usage-headroom gate was not in the routine pages reviewed. |
| 6. Catch-up loop | **FAIL** | The docs do not describe a catch-up that can be held, retried once per availability signal, or kept unfinished when it produces no report. The endless loop was not observed. The once-and-deliver behavior is not in the product surface that was checked. |
| 7. Report mislabeled | **FAIL** | No catch-up report is documented, so no label ties a later report to the skipped slot. A normal test result is described as showing up in the bot's chat. |
| 8. Reset time unknown | **UNVERIFIED** | The owner-facing reset time is documented (changelog 29 Sep 2026; staff reply 13 Sep 2026). This check did not spend a pool, so it did not see whether the scheduler stores that timestamp on a blocked fire. The absence of a skip row is graded under case 1. |
| 9. Stale routine | **FAIL** | Pause, delete, and edit apply to the routine itself, and waiting runs are cancelled on pause or delete. No doc says a usage-limit catch-up is rebuilt from the routine at start time, or dropped when the routine was deleted or paused after the skip. |

## Evidence

### Routine history has three statuses, and the routine screen has no catch-up control

[Routines](https://cursor.com/help/grok-bot/routines) (help, read 8 Oct 2026):

> On the phone, Run history shows each recent run as Running, Succeeded, or Failed. A failed run shows its reason. No runs yet means nothing has started the routine yet.

The same page lists the desktop actions as Pause or Resume, Test, Edit, and Delete routine. The phone screen lists Active, Schedule, Next run, Instruction, and Run history. "Why hasn't my routine run?" tells you to check pause, schedule, time zone, Slack, and webhook. It does not mention a usage-limit skip or a catch-up after reset.

[Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) says you can enable or pause a routine, run a test, edit its schedule or instructions, inspect recent success and failure history, or delete it. A bot can own 50 routines. The app keeps the 20 most recent run records. Deleting a routine is immediate. It does not list a usage-limit status or a catch-up mode.

[Grok Bot for Mobile](https://docs.x.ai/grok-bot/mobile) says the profile shows schedule, next run, instruction, and Run history, and Active pauses or resumes. Editing and testing are desktop-only on that page.

[Changelog, 5 Oct 2026, v0.68.0](https://x.ai/changelog/bot):

> Right-click a routine in the details pane for Pause, Resume, Test, Edit, and Delete; clicking a routine no longer opens its detail view.

The changelog text fetched the same day, through the latest listed release v0.68.1 on 7 Oct 2026, has no entry for a usage-limit skip label or for catching up a skipped routine after reset.

### A usage block skips the routine

[Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting), "A routine did not run", says to check that the routine is enabled, the schedule and time zone are correct, the bot still exists, plugins are authenticated, the computer can reach the source, and "Usage or account access has not been paused." Then: "Inspect recent run history for a failure." That is a prompt to look for a failure row. It does not define a skip row with slot and reset time, and it does not say the slot runs later.

[Plans and billing](https://cursor.com/help/grok-bot/plans):

> If on-demand is off, Grok Bot stops when weekly usage runs out. The screen says you have reached your Grok Bot usage limit, and it resets with weekly usage.

[Grok Bot FAQs](https://cursor.com/help/grok-bot/faqs): weekly usage resets each week. The way to keep going is on-demand or a bigger plan. Routines are not described as replaying missed slots.

Staff reply on 13 Sep 2026, on [All Grok Bots silent on iOS](https://forum.cursor.com/t/all-grok-bots-silent-on-ios-agent-computer-visible-but-no-replies/171458):

> Two notes: messages sent during the block stay queued. The bots will reply to them in a batch as soon as usage is available again. Scheduled routines that were due during the block were skipped.

The same reply says the exact reset time is in the app under Settings > Usage. It does not say those skipped routines run after the reset. It separates them from messages, which do wait and then reply in a batch.

### Reset time is shown to the owner

[Changelog, 29 Sep 2026](https://x.ai/changelog/bot):

> Settings → Usage & Billing shows your included usage and when it resets, instead of saying your plan has none.

[Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications) says Usage & Billing shows weekly included usage and on-demand usage, and that Timezone is what routines use for schedules. It does not say the scheduler writes that reset time onto a routine history row.

Case 8 stays UNVERIFIED because this check did not block a real fire and then read scheduler state. The owner-visible clock is documented. A catch-up that consumes it is not.

### Nearby behavior that is not this feature

[Changelog, 3 Sep 2026](https://x.ai/changelog/bot): "Pausing or deleting a routine also cancels runs that were waiting." [v0.51.0, 14 Sep 2026](https://x.ai/changelog/bot): "You can delete a routine, which also stops its future runs." [v0.52.0, 15 Sep 2026](https://x.ai/changelog/bot): "You can pause a routine and resume it later."

Those are real controls. They are not a usage-limit catch-up, and they do not record `Skipped — usage limit`.

[Grok Bot routines don't auto-run on schedule](https://forum.cursor.com/t/grok-bot-routines-dont-auto-run-on-schedule/170358) is about routines that did fire and then waited in a busy-time queue, including skips that showed nothing in the app. Staff described a later change that reserves a slot so those silent queue skips stop. That thread is the missed-wake / queue problem. It is out of scope here, and it is not a usage-limit catch-up.

[Grok Bot How Tos](https://cursor.com/help/grok-bot/how-to) tells you to confirm the routine is not paused. If it is not paused and has not run for 24 hours with no error, report a bug. That is the documented recovery. It is not an automatic catch-up.

## Second operator

A second person following only the live help, the docs, and the changelog cannot find the setting, the history label, the supersede note, or a stagger queue. Case (f) fails with the rest of the PASS list. The draft page in this repo is self-contained for the simulation. It is labeled draft, and it does not change the live grade.

## What was shipped instead of a build

- `demo/index.html` — public simulation with a FAIL banner, history labels, and a bench
- `drafts/help/catch-up-after-usage-resets.md` — draft help entry
- `drafts/SPEC.md` — draft contract, not approved to build

No live routine was created, paused, deleted, or run.
