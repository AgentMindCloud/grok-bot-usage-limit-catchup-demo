# Usage-limit skip catch-up for Grok Bot routines

Draft only. The live Grok Bot product does not record a usage-limit skip with the slot and reset time, and it does not catch a skipped routine up after usage returns.

**Live grade: FAIL.** The case-by-case receipt is [RECEIPT.md](RECEIPT.md). The simulation does not clear that grade, and it does not spend a usage pool.

## Public demo

https://agentmindcloud.github.io/grok-bot-usage-limit-catchup-demo/ (no sign-in). The page is one self-contained file, [index.html](index.html), also at [demo/index.html](demo/index.html), with no network calls. It is a draft simulation; the live grade stays FAIL.

To run it locally instead, from this directory run `python3 -m http.server 8000` and open http://127.0.0.1:8000/demo/.

## Check the simulation

```bash
node demo/verify-sim.mjs
```

That runs the eleven draft scenarios. After a change to `demo/catch-up-engine.js`, rebuild the page:

```bash
node demo/assemble.mjs
node demo/verify-sim.mjs
```

## Drafts, not a build

- [Draft help entry](drafts/help/catch-up-after-usage-resets.md)
- [Draft spec](drafts/SPEC.md)

These stay drafts until the owner says to build. They do not change Grok Bot.
