import fs from "node:fs";
import vm from "node:vm";

const enginePath = new URL("./catch-up-engine.js", import.meta.url);
const htmlPath = new URL("./index.html", import.meta.url);
const engine = fs.readFileSync(enginePath, "utf8");
const context = { console, Intl, Date };
vm.createContext(context);
vm.runInContext(engine, context);
const { CatchUp } = context;
if (!CatchUp || typeof CatchUp.demonstrate !== "function") {
  throw new Error("CatchUp.demonstrate is missing");
}

const scenarios = CatchUp.demonstrate();
let failed = 0;
for (const scenario of scenarios) {
  const bad = scenario.checks.filter((check) => !check.ok);
  if (!scenario.ok || bad.length) {
    failed += 1;
    console.error(`BROKEN case ${scenario.id}: ${scenario.title}`);
    for (const check of bad) console.error(`  - ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
  } else {
    console.log(`holds  case ${scenario.id}: ${scenario.title} (${scenario.checks.length} checks)`);
  }
}

if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, "utf8");
  if (!html.includes(engine)) {
    failed += 1;
    console.error("BROKEN demo/index.html does not contain the current engine");
  } else {
    console.log("holds  demo/index.html inlines the current engine");
  }
  if (!html.includes(">FAIL<") && !html.includes(">FAIL")) {
    failed += 1;
    console.error("BROKEN demo banner is missing FAIL");
  }
}

if (failed) {
  console.error(`${failed} scenario group(s) failed`);
  process.exit(1);
}
console.log(`${scenarios.length} draft scenarios hold`);
