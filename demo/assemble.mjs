import fs from "node:fs";

const engine = fs.readFileSync(new URL("./catch-up-engine.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("./index.template.html", import.meta.url), "utf8");
if (!template.includes("__ENGINE__")) {
  throw new Error("template is missing the engine slot");
}
if (engine.includes("__ENGINE__") || engine.includes("</script>")) {
  throw new Error("engine cannot be inlined safely");
}
const html = template.replace("__ENGINE__", engine.trimEnd());
fs.writeFileSync(new URL("./index.html", import.meta.url), html);
console.log("wrote demo/index.html");
