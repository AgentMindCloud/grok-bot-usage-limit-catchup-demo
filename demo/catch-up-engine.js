/**
 * Draft reference for usage-limit skip catch-up.
 * This is a simulation of a policy. It is not wired to Grok Bot.
 * Existing routines default to catch-up off.
 */
(function (root) {
  var EACH_CAP = 3;
  var SUPERSEDE_MS = 15 * 60 * 1000;
  var STAGGER_MS = 90 * 1000;
  var OPERATOR_TZ = "America/Phoenix";

  function formatSlot(epochMs, timeZone, withSeconds) {
    var options = {
      timeZone: timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    };
    if (withSeconds) options.second = "2-digit";
    var parts = new Intl.DateTimeFormat("en-US", options).formatToParts(new Date(epochMs));
    var bag = {};
    for (var i = 0; i < parts.length; i++) bag[parts[i].type] = parts[i].value;
    var hour = bag.hour === "24" ? "00" : String(bag.hour).padStart(2, "0");
    var second = withSeconds ? ":" + String(bag.second).padStart(2, "0") : "";
    return bag.year + "-" + bag.month + "-" + bag.day + " " + hour + ":" + bag.minute + second + " " + timeZone;
  }

  function formatReset(epochMs, timeZone) {
    if (epochMs == null) return "unknown";
    return formatSlot(epochMs, timeZone);
  }

  function createSim(now) {
    return {
      now: now,
      usageOpen: true,
      usagePercent: 0,
      routines: [],
      skips: [],
      history: [],
      reports: [],
      chat: [],
      queue: [],
      plan: [],
      seq: 1,
    };
  }

  function nextId(state) {
    var id = "id-" + state.seq;
    state.seq += 1;
    return id;
  }

  function getRoutine(state, routineId) {
    for (var i = 0; i < state.routines.length; i++) {
      if (state.routines[i].id === routineId) return state.routines[i];
    }
    throw new Error("Unknown routine " + routineId);
  }

  function addRoutine(state, spec) {
    var routine = {
      id: spec.id || nextId(state),
      name: spec.name,
      bot: spec.bot,
      tz: spec.tz,
      catchUp: spec.catchUp || "off",
      quietOnNone: !!spec.quietOnNone,
      paused: !!spec.paused,
      deleted: !!spec.deleted,
      computerDown: !!spec.computerDown,
      gate: spec.gate || null,
      prompt: spec.prompt || "",
      promptVersion: spec.promptVersion == null ? 1 : spec.promptVersion,
      outcome: spec.outcome || "report",
      reportBody: spec.reportBody || "",
      nextFireAt: spec.nextFireAt == null ? null : spec.nextFireAt,
      sampleSlotAt: spec.sampleSlotAt,
      sampleResetAt: spec.sampleResetAt == null ? null : spec.sampleResetAt,
    };
    state.routines.push(routine);
    return routine;
  }

  function setRoutine(state, routineId, patch) {
    var routine = getRoutine(state, routineId);
    var keys = Object.keys(patch);
    for (var i = 0; i < keys.length; i++) routine[keys[i]] = patch[keys[i]];
    return routine;
  }

  function pushHistory(state, routine, at, label, slotLabel, resetLabel, detail) {
    state.history.push({
      at: at,
      atLabel: formatSlot(at, OPERATOR_TZ),
      routineId: routine.id,
      routineName: routine.name,
      bot: routine.bot,
      label: label,
      slotLabel: slotLabel || "",
      resetLabel: resetLabel || "",
      detail: detail || "",
    });
  }

  function rememberSkip(state, routine, args, cause, label) {
    var slotLabel = formatSlot(args.slotAt, routine.tz);
    var resetLabel = cause === "usage_limit" ? formatReset(args.resetAt, routine.tz) : "";
    var skip = {
      id: nextId(state),
      routineId: routine.id,
      slotAt: args.slotAt,
      slotLabel: slotLabel,
      resetAt: cause === "usage_limit" ? (args.resetAt == null ? null : args.resetAt) : null,
      resetLabel: resetLabel,
      cause: cause,
      status: cause === "usage_limit" ? "open" : "ineligible",
      attempts: 0,
    };
    state.skips.push(skip);
    var detail = "";
    if (cause === "usage_limit") {
      detail = args.resetAt == null
        ? "Reset time was not on the limit signal. Catch-up waits for an availability signal."
        : "Slot recorded in " + routine.tz + ".";
      if (routine.catchUp === "off") detail += " Catch-up is off.";
    } else {
      detail = "Not a usage-limit skip. No catch-up.";
    }
    pushHistory(state, routine, args.at == null ? args.slotAt : args.at, label, slotLabel, resetLabel, detail);
    return skip;
  }

  function fire(state, args) {
    var routine = getRoutine(state, args.routineId);
    if (routine.deleted) return null;
    if (routine.paused) return rememberSkip(state, routine, args, "paused", "Skipped — paused");
    if (routine.computerDown) return rememberSkip(state, routine, args, "computer_down", "Skipped — computer down");
    if (args.usageBlocked) return rememberSkip(state, routine, args, "usage_limit", "Skipped — usage limit");
    var percent = args.usagePercent == null ? state.usagePercent : args.usagePercent;
    if (routine.gate && percent >= routine.gate.maxPercent) {
      return rememberSkip(state, routine, args, "owner_gate", "Skipped — owner gate false");
    }
    return null;
  }

  function reasonPhrase(reason) {
    if (reason === "weekly_reset") return "weekly reset";
    if (reason === "plan_top_up") return "plan top-up";
    if (reason === "owner_raised_limit") return "owner raised the limit";
    return reason;
  }

  function onUsageAvailable(state, args) {
    state.now = args.at;
    state.usageOpen = true;
    if (args.usagePercent != null) state.usagePercent = args.usagePercent;
    state.queue = state.queue.filter(function (skip) { return skip.status === "queued"; });
    var phrase = reasonPhrase(args.reason);
    var pending = [];
    for (var i = 0; i < state.skips.length; i++) {
      var skip = state.skips[i];
      if (skip.cause !== "usage_limit") continue;
      if (skip.status !== "open" && skip.status !== "held") continue;
      pending.push(skip);
    }
    var byRoutine = {};
    for (var p = 0; p < pending.length; p++) {
      var key = pending[p].routineId;
      if (!byRoutine[key]) byRoutine[key] = [];
      byRoutine[key].push(pending[p]);
    }
    var chosen = [];
    var routineIds = Object.keys(byRoutine);
    for (var r = 0; r < routineIds.length; r++) {
      var routine = getRoutine(state, routineIds[r]);
      var group = byRoutine[routine.id].slice().sort(function (a, b) { return b.slotAt - a.slotAt; });
      if (routine.deleted) {
        closeGroup(state, routine, group, args.at, "dropped", "Dropped — routine deleted", "The routine was deleted before catch-up.");
        continue;
      }
      if (routine.paused) {
        closeGroup(state, routine, group, args.at, "dropped", "Dropped — routine paused", "The routine was paused before catch-up.");
        continue;
      }
      if (routine.catchUp === "off") {
        closeGroup(state, routine, group, args.at, "waived", "Not queued — catch-up off", "The skip stays in history. This availability does not run it.");
        continue;
      }
      if (routine.nextFireAt != null && routine.nextFireAt >= args.at && routine.nextFireAt <= args.at + SUPERSEDE_MS) {
        var nextLabel = formatSlot(routine.nextFireAt, routine.tz);
        closeGroup(
          state,
          routine,
          group,
          args.at,
          "superseded",
          "superseded by scheduled run",
          "Next fire " + nextLabel + " is before or within 15 minutes of " + phrase + "."
        );
        continue;
      }
      var keep = routine.catchUp === "latest" ? group.slice(0, 1) : group.slice(0, EACH_CAP);
      var drop = routine.catchUp === "latest" ? group.slice(1) : group.slice(EACH_CAP);
      var dropLabel = routine.catchUp === "latest"
        ? "Dropped — latest skipped run only"
        : "Dropped — cap of " + EACH_CAP + " skipped slots";
      closeGroup(state, routine, drop, args.at, "dropped", dropLabel, "Older usage-limit skips stay in history and do not run.");
      for (var k = 0; k < keep.length; k++) chosen.push(keep[k]);
    }
    chosen.sort(function (a, b) {
      if (a.slotAt !== b.slotAt) return a.slotAt - b.slotAt;
      var ra = getRoutine(state, a.routineId);
      var rb = getRoutine(state, b.routineId);
      if (ra.bot !== rb.bot) return ra.bot < rb.bot ? -1 : 1;
      if (ra.name !== rb.name) return ra.name < rb.name ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
    var lastStart = null;
    for (var q = 0; q < state.queue.length; q++) {
      if (state.queue[q].status === "queued" && (lastStart == null || state.queue[q].startAt > lastStart)) {
        lastStart = state.queue[q].startAt;
      }
    }
    for (var c = 0; c < chosen.length; c++) {
      var item = chosen[c];
      item.status = "queued";
      item.startAt = lastStart == null ? args.at + c * STAGGER_MS : lastStart + (c + 1) * STAGGER_MS;
      item.availabilityReason = args.reason;
      state.queue.push(item);
      var owner = getRoutine(state, item.routineId);
      state.plan.push({
        skipId: item.id,
        routineId: owner.id,
        routineName: owner.name,
        bot: owner.bot,
        slotLabel: item.slotLabel,
        startAt: item.startAt,
        startLabel: formatSlot(item.startAt, OPERATOR_TZ, true),
        reason: phrase,
      });
    }
  }

  function closeGroup(state, routine, group, at, status, label, detail) {
    for (var i = 0; i < group.length; i++) {
      group[i].status = status;
      pushHistory(state, routine, at, label, group[i].slotLabel, group[i].resetLabel, detail);
    }
  }

  function executeCatchUp(state, skip) {
    if (skip.status !== "queued") return;
    var routine = getRoutine(state, skip.routineId);
    var at = skip.startAt;
    var phrase = reasonPhrase(skip.availabilityReason);
    if (routine.deleted) {
      skip.status = "dropped";
      pushHistory(state, routine, at, "Dropped — routine deleted", skip.slotLabel, skip.resetLabel, "Checked again at catch-up time. The saved prompt was not run.");
      return;
    }
    if (routine.paused) {
      skip.status = "dropped";
      pushHistory(state, routine, at, "Dropped — routine paused", skip.slotLabel, skip.resetLabel, "Checked again at catch-up time.");
      return;
    }
    if (routine.catchUp === "off") {
      skip.status = "dropped";
      pushHistory(state, routine, at, "Dropped — catch-up turned off", skip.slotLabel, skip.resetLabel, "The owner turned catch-up off before this start.");
      return;
    }
    if (routine.computerDown) {
      skip.status = "held";
      pushHistory(state, routine, at, "Not run — computer unavailable", skip.slotLabel, skip.resetLabel, "Held for a later availability signal. Not marked done. Not run again in this wave.");
      return;
    }
    if (routine.gate && state.usagePercent >= routine.gate.maxPercent) {
      skip.status = "dropped";
      pushHistory(
        state,
        routine,
        at,
        "Not run — owner gate false",
        skip.slotLabel,
        skip.resetLabel,
        "At catch-up time usage is " + state.usagePercent + "%. The gate allows a run only under " + routine.gate.maxPercent + "%."
      );
      return;
    }
    if (!state.usageOpen) {
      skip.status = "held";
      skip.attempts += 1;
      pushHistory(
        state,
        routine,
        at,
        "Catch-up held — usage limit",
        skip.slotLabel,
        skip.resetLabel,
        "Same slot stays open. Not marked done. Not re-queued until usage is available again."
      );
      return;
    }
    var title = "Catch-up for " + skip.slotLabel;
    if (routine.outcome === "none" && routine.quietOnNone) {
      skip.status = "done";
      pushHistory(state, routine, at, title, skip.slotLabel, skip.resetLabel, "Stayed quiet on NONE. After " + phrase + ". Prompt v" + routine.promptVersion + ".");
      state.chat.push({
        at: at,
        routineId: routine.id,
        routineName: routine.name,
        posted: false,
        title: title,
        body: "",
        slotLabel: skip.slotLabel,
        promptVersion: routine.promptVersion,
      });
      return;
    }
    if (routine.outcome === "none" || routine.outcome === "missing") {
      skip.status = "held";
      skip.attempts += 1;
      pushHistory(
        state,
        routine,
        at,
        "Catch-up incomplete — no report",
        skip.slotLabel,
        skip.resetLabel,
        "The report path produced nothing. Not marked done. Not re-queued in this wave."
      );
      return;
    }
    skip.status = "done";
    var report = {
      at: at,
      routineId: routine.id,
      routineName: routine.name,
      bot: routine.bot,
      title: title,
      slotLabel: skip.slotLabel,
      promptVersion: routine.promptVersion,
      prompt: routine.prompt,
      body: routine.reportBody,
      reason: phrase,
    };
    state.reports.push(report);
    state.chat.push({
      at: at,
      routineId: routine.id,
      routineName: routine.name,
      posted: true,
      title: title,
      body: routine.reportBody,
      slotLabel: skip.slotLabel,
      promptVersion: routine.promptVersion,
    });
    pushHistory(state, routine, at, title, skip.slotLabel, skip.resetLabel, "Delivered on the normal report path after " + phrase + ". Prompt v" + routine.promptVersion + ".");
  }

  function runDue(state, until) {
    var due = [];
    var seen = {};
    for (var i = 0; i < state.queue.length; i++) {
      var skip = state.queue[i];
      if (seen[skip.id]) continue;
      if (skip.status === "queued" && skip.startAt <= until) {
        seen[skip.id] = true;
        due.push(skip);
      }
    }
    due.sort(function (a, b) { return a.startAt - b.startAt; });
    for (var d = 0; d < due.length; d++) {
      state.now = due[d].startAt;
      executeCatchUp(state, due[d]);
    }
    if (until > state.now) state.now = until;
  }

  function historyLabels(sim) {
    return sim.history.map(function (row) { return row.label; });
  }

  function countLabel(sim, label) {
    var n = 0;
    for (var i = 0; i < sim.history.length; i++) if (sim.history[i].label === label) n += 1;
    return n;
  }

  function hasLabel(sim, label) {
    return countLabel(sim, label) > 0;
  }

  function friday() { return Date.parse("2026-10-09T15:00:00.000Z"); }
  function hour(n) { return friday() + n * 60 * 60 * 1000; }
  function sundayReset() { return Date.parse("2026-10-11T07:00:00.000Z"); }

  function check(sc, ok, name, detail) {
    sc.checks.push({ ok: !!ok, name: name, detail: detail || "" });
  }

  function scenarioShell(id, title, ask) {
    return { id: id, title: title, ask: ask, checks: [], sim: null };
  }

  function finish(sc, sim) {
    sc.sim = {
      history: sim.history,
      reports: sim.reports,
      chat: sim.chat,
      plan: sim.plan,
      skips: sim.skips.map(function (s) {
        return { status: s.status, slotLabel: s.slotLabel, cause: s.cause, resetLabel: s.resetLabel, routineId: s.routineId };
      }),
    };
    sc.ok = sc.checks.every(function (c) { return c.ok; });
    return sc;
  }

  function scenarioTrace() {
    var sc = scenarioShell("1", "Usage-limit skip leaves a history row", "A blocked fire records the slot and the reset time that was seen.");
    var sim = createSim(friday());
    var digest = addRoutine(sim, {
      name: "Weekday digest",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Summarize overnight tickets. If there is nothing to report, stay quiet.",
      reportBody: "Four tickets, one waiting on billing.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    fire(sim, { routineId: digest.id, slotAt: friday(), at: friday(), usageBlocked: true, resetAt: sundayReset() });
    var row = sim.history[0];
    check(sc, row && row.label === "Skipped — usage limit", "History label is Skipped — usage limit", row && row.label);
    check(sc, row && row.slotLabel === "2026-10-09 08:00 America/Phoenix", "Slot is the local date and minute in the routine time zone", row && row.slotLabel);
    check(sc, row && row.resetLabel === "2026-10-11 00:00 America/Phoenix", "Reset time seen is stored on the row", row && row.resetLabel);
    check(sc, sim.reports.length === 0 && sim.chat.length === 0, "The blocked fire does not deliver a report", "");
    return finish(sc, sim);
  }

  function scenarioDefaultOff() {
    var sc = scenarioShell("2", "Existing routines stay off", "After usage returns, a routine with catch-up off waits for its next slot.");
    var sim = createSim(friday());
    var digest = addRoutine(sim, {
      name: "Existing weekday digest",
      bot: "North",
      tz: "America/Phoenix",
      prompt: "Summarize overnight tickets.",
      reportBody: "Should not send.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    fire(sim, { routineId: digest.id, slotAt: friday(), usageBlocked: true, resetAt: sundayReset() });
    onUsageAvailable(sim, { at: sundayReset(), reason: "weekly_reset", usagePercent: 0 });
    runDue(sim, sundayReset() + 10 * STAGGER_MS);
    check(sc, hasLabel(sim, "Skipped — usage limit"), "The skip remains in history", "");
    check(sc, hasLabel(sim, "Not queued — catch-up off"), "Availability does not queue it", "");
    check(sc, sim.reports.length === 0 && sim.plan.length === 0, "No catch-up report is delivered", "");
    return finish(sc, sim);
  }

  function scenarioLatest() {
    var sc = scenarioShell("2", "Latest skipped run, labeled as that slot", "With catch-up on, the default mode runs the latest skipped slot once and names that slot.");
    var sim = createSim(friday());
    var monday = Date.parse("2026-10-12T15:00:00.000Z");
    var digest = addRoutine(sim, {
      name: "Weekday digest",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Summarize overnight tickets.",
      promptVersion: 1,
      reportBody: "Saturday queue: four tickets.",
      nextFireAt: monday,
    });
    fire(sim, { routineId: digest.id, slotAt: friday(), usageBlocked: true, resetAt: sundayReset() });
    fire(sim, { routineId: digest.id, slotAt: friday() + 24 * 60 * 60 * 1000, usageBlocked: true, resetAt: sundayReset() });
    onUsageAvailable(sim, { at: sundayReset(), reason: "weekly_reset", usagePercent: 0 });
    runDue(sim, sundayReset() + 10 * STAGGER_MS);
    var report = sim.reports[0];
    check(sc, countLabel(sim, "Skipped — usage limit") === 2, "Both blocked slots are in history", "");
    check(sc, hasLabel(sim, "Dropped — latest skipped run only"), "The older slot is not replayed", "");
    check(sc, sim.reports.length === 1, "Exactly one catch-up report", String(sim.reports.length));
    check(sc, report && report.title === "Catch-up for 2026-10-10 08:00 America/Phoenix", "The report is labeled with the skipped slot", report && report.title);
    check(sc, report && report.title.indexOf("2026-10-12") === -1, "The report is not labeled as Monday's slot", report && report.title);
    check(sc, report && report.reason === "weekly reset", "The trigger recorded here is the weekly reset", report && report.reason);
    return finish(sc, sim);
  }

  function scenarioStagger() {
    var sc = scenarioShell("3", "Catch-ups are queued, not burst", "Skipped slots across bots take staggered starts, and each-slot mode keeps a cap.");
    var sim = createSim(friday());
    var reset = sundayReset();
    var north = addRoutine(sim, {
      name: "Hourly digest",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "each",
      prompt: "Check the hourly queue.",
      reportBody: "Hourly note.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    var south = addRoutine(sim, {
      name: "Standup",
      bot: "South",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Post the standup.",
      reportBody: "Standup note.",
      nextFireAt: Date.parse("2026-10-12T16:00:00.000Z"),
    });
    var east = addRoutine(sim, {
      name: "Alerts",
      bot: "East",
      tz: "America/New_York",
      catchUp: "each",
      prompt: "List new alerts.",
      reportBody: "Alert note.",
      nextFireAt: Date.parse("2026-10-12T14:00:00.000Z"),
    });
    fire(sim, { routineId: north.id, slotAt: hour(0), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: north.id, slotAt: hour(1), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: north.id, slotAt: hour(2), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: north.id, slotAt: hour(3), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: south.id, slotAt: hour(0) + 15 * 60 * 1000, usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: east.id, slotAt: hour(0) + 30 * 60 * 1000, usageBlocked: true, resetAt: reset });
    onUsageAvailable(sim, { at: reset, reason: "weekly_reset", usagePercent: 0 });
    var starts = sim.plan.map(function (row) { return row.startAt; }).sort(function (a, b) { return a - b; });
    var spaced = starts.length >= 2;
    for (var i = 1; i < starts.length; i++) if (starts[i] - starts[i - 1] !== STAGGER_MS) spaced = false;
    var unique = {};
    for (var u = 0; u < starts.length; u++) unique[starts[u]] = true;
    runDue(sim, reset);
    var startedImmediately = sim.reports.length;
    runDue(sim, reset + 10 * STAGGER_MS);
    check(sc, hasLabel(sim, "Dropped — cap of 3 skipped slots"), "Each-slot mode drops slots past the cap of 3", "");
    check(sc, sim.plan.length === 5, "Five catch-ups are queued across three bots", String(sim.plan.length));
    check(sc, spaced && Object.keys(unique).length === starts.length, "Starts are 90 seconds apart", sim.plan.map(function (row) { return row.startLabel; }).join(" · "));
    check(sc, sim.plan.length > 1 && sim.plan[1].startLabel.indexOf(":30 ") !== -1, "Start labels include seconds, so the 90-second gap is visible", sim.plan[1] && sim.plan[1].startLabel);
    check(sc, startedImmediately === 1, "The first moment runs one catch-up", String(startedImmediately));
    check(sc, sim.reports.length === 5, "The rest run on their own starts, still one report each", String(sim.reports.length));
    var bots = {};
    for (var b = 0; b < sim.plan.length; b++) bots[sim.plan[b].bot] = true;
    check(sc, bots.North && bots.South && bots.East, "The queue is global across bots", Object.keys(bots).join(", "));
    return finish(sc, sim);
  }

  function scenarioSupersede() {
    var sc = scenarioShell("4", "A near scheduled fire supersedes the catch-up", "If the next fire is before or within 15 minutes of availability, the catch-up is dropped.");
    var sim = createSim(friday());
    var reset = sundayReset();
    var soon = addRoutine(sim, {
      name: "Hourly digest",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Check the queue.",
      reportBody: "Should not send.",
      nextFireAt: reset + 10 * 60 * 1000,
    });
    var edge = addRoutine(sim, {
      name: "Edge digest",
      bot: "South",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Check the edge.",
      reportBody: "Should not send.",
      nextFireAt: reset + SUPERSEDE_MS,
    });
    var clear = addRoutine(sim, {
      name: "Later digest",
      bot: "East",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Check later.",
      reportBody: "Later note.",
      nextFireAt: reset + SUPERSEDE_MS + 1,
    });
    fire(sim, { routineId: soon.id, slotAt: friday(), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: edge.id, slotAt: friday(), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: clear.id, slotAt: friday(), usageBlocked: true, resetAt: reset });
    onUsageAvailable(sim, { at: reset, reason: "weekly_reset", usagePercent: 0 });
    runDue(sim, reset + 10 * STAGGER_MS);
    check(sc, countLabel(sim, "superseded by scheduled run") === 2, "The 10-minute fire and the 15-minute fire are superseded", String(countLabel(sim, "superseded by scheduled run")));
    check(sc, sim.reports.length === 1 && sim.reports[0].routineName === "Later digest", "A fire one millisecond outside the window still catches up once", sim.reports[0] && sim.reports[0].routineName);
    check(sc, sim.reports.every(function (r) { return r.routineName !== "Hourly digest" && r.routineName !== "Edge digest"; }), "Superseded routines do not also deliver a catch-up", "");
    return finish(sc, sim);
  }

  function scenarioWrongCause() {
    var sc = scenarioShell("5", "Other skip reasons do not catch up", "Paused, computer-down, and owner-gate skips stay out of the catch-up queue.");
    var sim = createSim(friday());
    var reset = sundayReset();
    var paused = addRoutine(sim, {
      name: "Paused digest",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "each",
      paused: true,
      prompt: "Paused work.",
      reportBody: "Should not send.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    var down = addRoutine(sim, {
      name: "Desk backup",
      bot: "South",
      tz: "America/Phoenix",
      catchUp: "latest",
      computerDown: true,
      prompt: "Backup the desk.",
      reportBody: "Should not send.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    var gated = addRoutine(sim, {
      name: "Headroom scout",
      bot: "East",
      tz: "America/Phoenix",
      catchUp: "latest",
      gate: { maxPercent: 40 },
      prompt: "Scout only under 40% usage.",
      reportBody: "Should not send.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    fire(sim, { routineId: paused.id, slotAt: friday(), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: down.id, slotAt: friday(), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: gated.id, slotAt: friday(), usageBlocked: false, usagePercent: 80, resetAt: reset });
    onUsageAvailable(sim, { at: reset, reason: "weekly_reset", usagePercent: 0 });
    runDue(sim, reset + 10 * STAGGER_MS);
    check(sc, hasLabel(sim, "Skipped — paused"), "A paused routine is labeled paused", "");
    check(sc, hasLabel(sim, "Skipped — computer down"), "A down computer is labeled computer down", "");
    check(sc, hasLabel(sim, "Skipped — owner gate false"), "A gate miss is labeled owner gate false", "");
    check(sc, !hasLabel(sim, "Skipped — usage limit"), "None of these rows claim the usage limit", "");
    check(sc, sim.reports.length === 0 && sim.plan.length === 0, "Availability does not run them", "");
    return finish(sc, sim);
  }

  function scenarioGateAtRun() {
    var sc = scenarioShell("5", "The usage gate is judged again at catch-up time", "A usage-limit skip still has to pass the owner gate when its catch-up starts.");
    var sim = createSim(friday());
    var reset = sundayReset();
    var openGate = addRoutine(sim, {
      name: "Open scout",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "latest",
      gate: { maxPercent: 40 },
      prompt: "Scout under 40%.",
      reportBody: "Usage is low enough.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    var tight = addRoutine(sim, {
      name: "Tight scout",
      bot: "South",
      tz: "America/Phoenix",
      catchUp: "latest",
      gate: { maxPercent: 40 },
      prompt: "Scout under 40%.",
      reportBody: "Should not send.",
      nextFireAt: Date.parse("2026-10-12T18:00:00.000Z"),
    });
    fire(sim, { routineId: openGate.id, slotAt: friday(), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: tight.id, slotAt: friday() + 60 * 1000, usageBlocked: true, resetAt: reset });
    onUsageAvailable(sim, { at: reset, reason: "owner_raised_limit", usagePercent: 10 });
    runDue(sim, reset);
    sim.usagePercent = 55;
    runDue(sim, reset + 10 * STAGGER_MS);
    check(sc, countLabel(sim, "Skipped — usage limit") === 2, "Both fires were usage-limit skips", "");
    check(sc, sim.reports.length === 1 && sim.reports[0].routineName === "Open scout", "The first catch-up runs while usage is under the gate", sim.reports[0] && sim.reports[0].routineName);
    check(sc, hasLabel(sim, "Not run — owner gate false"), "The later catch-up sees usage above the gate and does not run", "");
    check(sc, sim.reports.every(function (r) { return r.routineName !== "Tight scout"; }), "The gated-off catch-up delivers no report", "");
    check(sc, sim.reports[0] && sim.reports[0].reason === "owner raised the limit", "Raising the limit is an availability signal", sim.reports[0] && sim.reports[0].reason);
    return finish(sc, sim);
  }

  function scenarioLoop() {
    var sc = scenarioShell("6", "A catch-up that hits the limit is not a loop and is not done", "The same slot waits for another availability signal. A missing report is not marked done.");
    var sim = createSim(friday());
    var reset = sundayReset();
    var digest = addRoutine(sim, {
      name: "Weekday digest",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Summarize tickets.",
      reportBody: "Two tickets after the top-up.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    var blank = addRoutine(sim, {
      name: "Blank ledger",
      bot: "South",
      tz: "America/Phoenix",
      catchUp: "latest",
      outcome: "missing",
      prompt: "Write the ledger.",
      reportBody: "",
      nextFireAt: Date.parse("2026-10-12T16:00:00.000Z"),
    });
    fire(sim, { routineId: blank.id, slotAt: friday(), usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: digest.id, slotAt: friday() + 60 * 1000, usageBlocked: true, resetAt: reset });
    onUsageAvailable(sim, { at: reset, reason: "weekly_reset", usagePercent: 0 });
    runDue(sim, reset);
    sim.usageOpen = false;
    runDue(sim, reset + 10 * STAGGER_MS);
    var heldOnce = countLabel(sim, "Catch-up held — usage limit");
    var incompleteOnce = countLabel(sim, "Catch-up incomplete — no report");
    runDue(sim, reset + 20 * STAGGER_MS);
    var digestSkip = null;
    var blankSkip = null;
    for (var i = 0; i < sim.skips.length; i++) {
      var owner = getRoutine(sim, sim.skips[i].routineId);
      if (owner.name === "Weekday digest") digestSkip = sim.skips[i];
      if (owner.name === "Blank ledger") blankSkip = sim.skips[i];
    }
    check(sc, heldOnce === 1 && countLabel(sim, "Catch-up held — usage limit") === 1, "Hitting the limit again records one hold, and a second drain does not re-queue it", "");
    check(sc, digestSkip && digestSkip.status === "held" && digestSkip.attempts === 1, "The held slot is not marked done", digestSkip && digestSkip.status);
    check(sc, incompleteOnce === 1 && blankSkip && blankSkip.status === "held", "A catch-up with no report is not marked done", blankSkip && blankSkip.status);
    check(sc, sim.reports.length === 0, "Nothing is delivered in that wave", "");
    sim.usageOpen = true;
    onUsageAvailable(sim, { at: reset + 24 * 60 * 60 * 1000, reason: "plan_top_up", usagePercent: 0 });
    setRoutine(sim, blank.id, { outcome: "report", reportBody: "Ledger after the top-up." });
    runDue(sim, reset + 24 * 60 * 60 * 1000 + 10 * STAGGER_MS);
    check(sc, sim.reports.length === 2, "The next availability runs each held slot once", String(sim.reports.length));
    check(sc, sim.reports.some(function (r) { return r.reason === "plan top-up" && r.slotLabel === "2026-10-09 08:00 America/Phoenix"; }), "The top-up report still names the original slot", "");
    var extra = sim.reports.length;
    runDue(sim, reset + 48 * 60 * 60 * 1000);
    check(sc, sim.reports.length === extra, "Completed catch-ups do not run again", "");
    return finish(sc, sim);
  }

  function scenarioQuiet() {
    var sc = scenarioShell("7", "Quiet-on-NONE stays quiet, and the slot name stays", "The catch-up uses the routine's normal delivery rule and does not pretend to be the current slot.");
    var sim = createSim(friday());
    var reset = sundayReset();
    var digest = addRoutine(sim, {
      name: "Quiet digest",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "latest",
      quietOnNone: true,
      outcome: "none",
      prompt: "Summarize tickets. If there is nothing to report, stay quiet.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    fire(sim, { routineId: digest.id, slotAt: friday(), usageBlocked: true, resetAt: reset });
    onUsageAvailable(sim, { at: reset, reason: "weekly_reset", usagePercent: 0 });
    runDue(sim, reset + STAGGER_MS);
    var row = null;
    for (var i = 0; i < sim.history.length; i++) {
      if (sim.history[i].label.indexOf("Catch-up for ") === 0) row = sim.history[i];
    }
    var skip = sim.skips[0];
    check(sc, row && row.label === "Catch-up for 2026-10-09 08:00 America/Phoenix", "History names the skipped slot", row && row.label);
    check(sc, row && row.detail.indexOf("Stayed quiet on NONE") === 0, "The quiet rule is the normal NONE path", row && row.detail);
    check(sc, sim.chat.length === 1 && sim.chat[0].posted === false, "No chat message is posted", "");
    check(sc, sim.reports.length === 0, "A quiet NONE is not a posted report", "");
    check(sc, skip && skip.status === "done", "Quiet delivery is complete, not a missing report", skip && skip.status);
    check(sc, row && row.label.indexOf("2026-10-12") === -1, "The current Monday slot is not the label", row && row.label);
    return finish(sc, sim);
  }

  function scenarioUnknownReset() {
    var sc = scenarioShell("8", "An unknown reset time does not invent a clock", "The skip records unknown. Catch-up runs when an availability signal arrives.");
    var sim = createSim(friday());
    var digest = addRoutine(sim, {
      name: "Weekday digest",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Summarize tickets.",
      reportBody: "Came back after the limit was raised.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    fire(sim, { routineId: digest.id, slotAt: friday(), usageBlocked: true, resetAt: null });
    var guessedWeek = friday() + 7 * 24 * 60 * 60 * 1000;
    sim.now = guessedWeek;
    runDue(sim, guessedWeek);
    check(sc, sim.history[0].resetLabel === "unknown", "The row says the reset time is unknown", sim.history[0].resetLabel);
    check(sc, sim.reports.length === 0 && sim.plan.length === 0, "Moving the clock without a signal does not run a catch-up", "");
    onUsageAvailable(sim, { at: guessedWeek, reason: "owner_raised_limit", usagePercent: 5 });
    runDue(sim, guessedWeek + STAGGER_MS);
    check(sc, sim.reports.length === 1, "Raising the limit runs the catch-up once", String(sim.reports.length));
    check(sc, sim.reports[0].title === "Catch-up for 2026-10-09 08:00 America/Phoenix", "The report still names the skipped slot", sim.reports[0].title);
    return finish(sc, sim);
  }

  function scenarioStale() {
    var sc = scenarioShell("9", "Pause, delete, and edit are read again at catch-up time", "A queued catch-up does not run a routine that was paused or deleted, and an edit uses the current prompt.");
    var sim = createSim(friday());
    var reset = sundayReset();
    var doomed = addRoutine(sim, {
      name: "Doomed digest",
      bot: "North",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Old doomed prompt.",
      promptVersion: 1,
      reportBody: "Should not send.",
      nextFireAt: Date.parse("2026-10-12T15:00:00.000Z"),
    });
    var resting = addRoutine(sim, {
      name: "Resting digest",
      bot: "South",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Old resting prompt.",
      promptVersion: 1,
      reportBody: "Should not send.",
      nextFireAt: Date.parse("2026-10-12T16:00:00.000Z"),
    });
    var edited = addRoutine(sim, {
      name: "Edited digest",
      bot: "East",
      tz: "Europe/London",
      catchUp: "latest",
      prompt: "Summarize Friday's tickets.",
      promptVersion: 1,
      reportBody: "This body is from the edited prompt.",
      nextFireAt: Date.parse("2026-10-12T08:00:00.000Z"),
    });
    var unreachable = addRoutine(sim, {
      name: "Unreachable desk",
      bot: "West",
      tz: "America/Phoenix",
      catchUp: "latest",
      prompt: "Read the desk.",
      reportBody: "Should not send.",
      nextFireAt: Date.parse("2026-10-12T19:00:00.000Z"),
    });
    var slot = friday();
    fire(sim, { routineId: doomed.id, slotAt: slot, usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: resting.id, slotAt: slot + 60 * 1000, usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: edited.id, slotAt: slot + 120 * 1000, usageBlocked: true, resetAt: reset });
    fire(sim, { routineId: unreachable.id, slotAt: slot + 180 * 1000, usageBlocked: true, resetAt: reset });
    onUsageAvailable(sim, { at: reset, reason: "weekly_reset", usagePercent: 0 });
    setRoutine(sim, doomed.id, { deleted: true });
    setRoutine(sim, resting.id, { paused: true });
    setRoutine(sim, edited.id, { prompt: "Summarize Saturday's tickets only.", promptVersion: 2, reportBody: "Saturday only, from prompt v2." });
    setRoutine(sim, unreachable.id, { computerDown: true });
    runDue(sim, reset + 10 * STAGGER_MS);
    check(sc, hasLabel(sim, "Dropped — routine deleted"), "Delete drops the queued catch-up", "");
    check(sc, hasLabel(sim, "Dropped — routine paused"), "Pause drops the queued catch-up", "");
    check(sc, sim.reports.length === 1 && sim.reports[0].routineName === "Edited digest", "The edited routine still catches up once", "");
    check(sc, sim.reports[0] && sim.reports[0].promptVersion === 2, "The report uses the edited prompt", String(sim.reports[0] && sim.reports[0].promptVersion));
    check(sc, sim.reports[0] && sim.reports[0].prompt === "Summarize Saturday's tickets only.", "The old prompt text is not what runs", sim.reports[0] && sim.reports[0].prompt);
    check(sc, sim.reports[0] && sim.reports[0].slotLabel.indexOf("Europe/London") !== -1, "The label keeps the original slot in that routine's time zone", sim.reports[0] && sim.reports[0].slotLabel);
    check(sc, sim.reports.every(function (r) { return r.routineName !== "Doomed digest" && r.routineName !== "Resting digest" && r.routineName !== "Unreachable desk"; }), "Deleted, paused, and unreachable routines do not deliver", "");
    check(sc, hasLabel(sim, "Not run — computer unavailable"), "A computer that is down at catch-up time does not run", "");
    var unreachableSkip = null;
    for (var u = 0; u < sim.skips.length; u++) {
      if (sim.skips[u].routineId === unreachable.id) unreachableSkip = sim.skips[u];
    }
    check(sc, unreachableSkip && unreachableSkip.status === "held", "The unreachable catch-up is held, not done", unreachableSkip && unreachableSkip.status);
    return finish(sc, sim);
  }

  function demonstrate() {
    return [
      scenarioTrace(),
      scenarioDefaultOff(),
      scenarioLatest(),
      scenarioStagger(),
      scenarioSupersede(),
      scenarioWrongCause(),
      scenarioGateAtRun(),
      scenarioLoop(),
      scenarioQuiet(),
      scenarioUnknownReset(),
      scenarioStale(),
    ];
  }

  root.CatchUp = {
    EACH_CAP: EACH_CAP,
    SUPERSEDE_MS: SUPERSEDE_MS,
    STAGGER_MS: STAGGER_MS,
    OPERATOR_TZ: OPERATOR_TZ,
    formatSlot: formatSlot,
    createSim: createSim,
    addRoutine: addRoutine,
    setRoutine: setRoutine,
    fire: fire,
    onUsageAvailable: onUsageAvailable,
    runDue: runDue,
    demonstrate: demonstrate,
    historyLabels: historyLabels,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
