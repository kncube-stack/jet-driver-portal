const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const OUTPUT_DIR = path.join(process.cwd(), "output");
const DATA_PATH = path.join(process.cwd(), "index_files", "jet-data.js");

const BLOCKED = new Set([
  "000000", "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999",
  "123456", "234567", "345678", "456789", "567890", "654321", "543210", "012345",
  "101010", "202020", "121212", "696969", "112233", "445566"
]);

function loadJetData() {
  const source = fs.readFileSync(DATA_PATH, "utf8");
  const context = vm.createContext({ window: {} });
  const script = new vm.Script(source, { filename: "jet-data.js" });
  script.runInContext(context, { timeout: 1200 });
  return context.window.JET_DATA || {};
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomPin(usedPins) {
  let pin = "";
  do {
    pin = String(Math.floor(Math.random() * 900000) + 100000);
  } while (usedPins.has(pin) || BLOCKED.has(pin));
  return pin;
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPinOutputs(sections, pinByName, hashMap) {
  const textLines = [];
  textLines.push("=== VERCEL ENV VAR: AUTH_USER_PIN_HASHES ===");
  textLines.push(JSON.stringify(hashMap));
  textLines.push("");
  textLines.push("=== STAFF PIN HANDOUT ===");
  textLines.push("");
  textLines.push("JET DRIVER PORTAL - ACCESS PINS");
  textLines.push("");
  sections.forEach(section => {
    textLines.push(`-- ${section.label} --`);
    section.drivers.forEach(name => {
      const pad = " ".repeat(Math.max(1, 32 - name.length));
      textLines.push(`  ${name}${pad}${pinByName[name]}`);
    });
    textLines.push("");
  });
  const plainText = textLines.join("\n");

  const jsonText = JSON.stringify(hashMap);

  const sectionHtml = sections.map(section => {
    const rows = section.drivers.map(name => `<tr><td>${htmlEscape(name)}</td><td class="pin">${htmlEscape(pinByName[name])}</td></tr>`).join("");
    return `<div class="section"><div class="section-title">${htmlEscape(section.label)}</div><table>${rows}</table></div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>JET Driver Portal - Staff PINs</title>
  <style>
    body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1a1a;margin:30px 40px}
    h1{font-size:15pt;font-weight:bold;border-bottom:2px solid #1a1a1a;padding-bottom:5px;margin-bottom:4px}
    .subtitle{font-size:9pt;color:#666;margin-bottom:20px}
    .warning{background:#fffbeb;border-left:4px solid #f59e0b;padding:8px 12px;font-size:10pt;margin-bottom:22px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 40px}
    .section{margin-bottom:18px;break-inside:avoid}
    .section-title{font-weight:bold;font-size:10pt;background:#f0f0f0;padding:3px 6px;margin-bottom:5px}
    table{width:100%;border-collapse:collapse}
    td{padding:3px 6px;font-size:10.5pt}
    td.pin{font-weight:bold;font-family:'Courier New',monospace;font-size:12pt;text-align:right;letter-spacing:2px;color:#1a1a1a}
    tr:nth-child(even) td{background:#f9f9f9}
    @media print{body{margin:15px 20px}}
  </style>
</head>
<body>
  <h1>JET Driver Portal - Staff Access PINs</h1>
  <p class="subtitle">Generated March 2026 - Keep this document secure - Do not share PINs between staff members</p>
  <div class="warning"><strong>Instructions for staff:</strong> Go to the portal, type your full name, then enter your 6-digit PIN.</div>
  <div class="grid">${sectionHtml}</div>
</body>
</html>`;

  return { plainText, jsonText, html };
}

function main() {
  const data = loadJetData();
  const rawSections = Array.isArray(data.STAFF_DIRECTORY) ? data.STAFF_DIRECTORY : [];
  const sections = rawSections
    .map(section => ({
      label: String(section?.label || section?.key || "").trim(),
      drivers: Array.isArray(section?.drivers) ? section.drivers.map(name => String(name || "").trim()).filter(Boolean) : []
    }))
    .filter(section => section.label && section.drivers.length > 0);

  const staffNames = [];
  const seenNames = new Set();
  sections.forEach(section => {
    section.drivers.forEach(name => {
      if (seenNames.has(name)) return;
      seenNames.add(name);
      staffNames.push(name);
    });
  });

  const usedPins = new Set();
  const pinByName = {};
  const hashMap = {};
  staffNames.forEach(name => {
    const pin = randomPin(usedPins);
    usedPins.add(pin);
    pinByName[name] = pin;
    hashMap[name] = sha256(pin);
  });

  const outputs = buildPinOutputs(sections, pinByName, hashMap);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "gen-pins-output.txt"), outputs.plainText + "\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, "AUTH_USER_PIN_HASHES.txt"), outputs.jsonText + "\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, "staff-pins-handout.html"), outputs.html + "\n");

  console.log(`Generated 6-digit PINs for ${staffNames.length} staff.`);
  console.log(`Admin access names: ${(Array.isArray(data.ACCESS_CONTROL?.managerNames) ? data.ACCESS_CONTROL.managerNames : []).join(", ")}`);
  console.log(`Wrote ${path.join("output", "gen-pins-output.txt")}`);
  console.log(`Wrote ${path.join("output", "AUTH_USER_PIN_HASHES.txt")}`);
  console.log(`Wrote ${path.join("output", "staff-pins-handout.html")}`);
  const myPin = pinByName["Kennedy Ncube"];
  if (myPin) {
    console.log(`Kennedy Ncube PIN: ${myPin}`);
  }
}

main();
