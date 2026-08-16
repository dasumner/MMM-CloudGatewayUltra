#!/usr/bin/env node
// Standalone connectivity/diagnostic check — exercises the exact same
// unifi-client.js the MagicMirror module uses, without needing MagicMirror
// installed. Configure via env vars so no secret ever touches disk:
//
//   CGU_HOST=192.168.1.1 CGU_API_KEY=xxxx node bin/check-status.js
//
// Optional env vars: CGU_PORT (443), CGU_USE_HTTP (false),
// CGU_REJECT_UNAUTHORIZED (false), CGU_SITE_ID (default), CGU_DEVICE_ID.

const { UnifiClient } = require("../unifi-client");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

const config = {
  host: requireEnv("CGU_HOST"),
  apiKey: requireEnv("CGU_API_KEY"),
  port: parseInt(process.env.CGU_PORT || "443", 10),
  useHttp: process.env.CGU_USE_HTTP === "true",
  rejectUnauthorized: process.env.CGU_REJECT_UNAUTHORIZED === "true",
  siteId: process.env.CGU_SITE_ID || "default",
  deviceId: process.env.CGU_DEVICE_ID || null,
  cpuAlertThreshold: 85,
  memAlertThreshold: 85,
  maxAlerts: 5
};

(async () => {
  const client = new UnifiClient(config, (...args) => console.log("[debug]", ...args));

  try {
    const { device, stats, status, alerts } = await client.fetchStatus();

    console.log("\n=== Resolved ===");
    console.log("siteId:", client.siteId);
    console.log("deviceId:", client.deviceId);

    console.log("\n=== Raw device payload ===");
    console.log(JSON.stringify(device, null, 2));

    console.log("\n=== Raw statistics/latest payload ===");
    console.log(JSON.stringify(stats, null, 2));

    console.log("\n=== Parsed status (what the mirror will show) ===");
    console.log(status);

    console.log("\n=== Alerts ===");
    console.log(alerts.length ? alerts : "None");

    console.log("\nOK — connection and parsing succeeded.");
  } catch (err) {
    console.error("\nRequest failed:", err.message);
    process.exit(1);
  }
})();
