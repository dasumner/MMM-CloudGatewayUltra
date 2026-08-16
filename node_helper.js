const https = require("https");
const http = require("http");
const NodeHelper = require("node_helper");

const GATEWAY_MODEL_HINT = /UCG|UDM|UXG|DREAM|GATEWAY/i;

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.pollTimer = null;
    this.siteId = null;
    this.deviceId = null;
    this.polling = false;
  },

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "CGU_INIT") return;

    this.config = payload;
    this.siteId = null;
    this.deviceId = null;

    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.poll(), this.config.updateInterval);
    this.poll();
  },

  // --- HTTP -----------------------------------------------------------

  request(path) {
    const config = this.config;
    const transport = config.useHttp ? http : https;
    const options = {
      hostname: config.host,
      port: config.port,
      path,
      method: "GET",
      headers: {
        "X-API-Key": config.apiKey,
        Accept: "application/json"
      },
      rejectUnauthorized: config.rejectUnauthorized === true,
      timeout: 10000
    };

    return new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode} for ${path}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            const json = JSON.parse(body);
            resolve(json);
          } catch (err) {
            reject(new Error(`Invalid JSON from ${path}: ${err.message}`));
          }
        });
      });
      req.on("timeout", () => req.destroy(new Error(`Timed out requesting ${path}`)));
      req.on("error", reject);
      req.end();
    });
  },

  apiPath(suffix) {
    return `/proxy/network/integration/v1${suffix}`;
  },

  log(...args) {
    if (this.config && this.config.debug) console.log("[MMM-CloudGatewayUltra]", ...args);
  },

  // --- Discovery --------------------------------------------------------

  async resolveSite() {
    const res = await this.request(this.apiPath("/sites"));
    const sites = res.data || [];
    this.log("sites:", JSON.stringify(sites));
    if (!sites.length) throw new Error("Controller returned no sites");

    const wanted = this.config.siteId;
    if (wanted && wanted !== "default") {
      const bySpecificId = sites.find((s) => s.id === wanted);
      if (bySpecificId) return bySpecificId.id;
    }
    const byName = sites.find((s) => s.name === "default");
    return (byName || sites[0]).id;
  },

  async resolveDevice(siteId) {
    const res = await this.request(this.apiPath(`/sites/${siteId}/devices`));
    const devices = res.data || [];
    this.log("devices:", JSON.stringify(devices));
    if (!devices.length) throw new Error("Site returned no devices");

    const wanted = this.config.deviceId;
    if (wanted) {
      const match = devices.find(
        (d) => d.id === wanted || (d.macAddress || "").toLowerCase() === String(wanted).toLowerCase()
      );
      if (match) return match.id;
      throw new Error(`Configured deviceId "${wanted}" not found among site devices`);
    }

    const byModel = devices.find((d) => GATEWAY_MODEL_HINT.test(d.model || d.type || ""));
    if (byModel) return byModel.id;

    if (devices.length === 1) return devices[0].id;

    throw new Error(
      "Could not auto-detect the gateway device. Set `deviceId` in the module config to its id or MAC address."
    );
  },

  async ensureResolved() {
    if (this.siteId && this.deviceId) return;
    this.siteId = await this.resolveSite();
    this.deviceId = await this.resolveDevice(this.siteId);
    this.log(`resolved siteId=${this.siteId} deviceId=${this.deviceId}`);
  },

  // --- Polling ----------------------------------------------------------

  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.ensureResolved();

      const [deviceRes, statsRes] = await Promise.all([
        this.request(this.apiPath(`/sites/${this.siteId}/devices/${this.deviceId}`)),
        this.request(
          this.apiPath(`/sites/${this.siteId}/devices/${this.deviceId}/statistics/latest`)
        )
      ]);

      const device = deviceRes.data || deviceRes;
      const stats = statsRes.data || statsRes;
      this.log("device:", JSON.stringify(device));
      this.log("stats:", JSON.stringify(stats));

      const status = this.buildStatus(device, stats);
      const alerts = this.buildAlerts(device, stats, status);

      this.sendSocketNotification("CGU_STATUS", { status, alerts });
    } catch (err) {
      this.log("poll error:", err.message);
      // A resolution failure should be retried from scratch next tick.
      this.siteId = null;
      this.deviceId = null;
      this.sendSocketNotification("CGU_ERROR", { message: err.message });
    } finally {
      this.polling = false;
    }
  },

  buildStatus(device, stats) {
    const uplink = stats.uplink || stats.uplinkExpand || device.uplink || {};
    return {
      name: device.name || device.model || "Cloud Gateway Ultra",
      model: device.model || device.type || "",
      state: device.state || "UNKNOWN",
      ipAddress: device.ipAddress || device.ip || null,
      firmwareVersion: device.firmwareVersion || device.version || null,
      uptimeSec: numOrNull(stats.uptimeSec ?? device.uptimeSec),
      cpuPct: numOrNull(stats.cpuUtilizationPct ?? stats.cpu),
      memPct: numOrNull(stats.memoryUtilizationPct ?? stats.mem),
      load1: numOrNull(stats.loadAverage1Min),
      wanUp: wanUpFromUplink(uplink),
      wanIsp: uplink.ispName || uplink.isp || null,
      wanIp: uplink.ip || uplink.wanIp || null,
      updatedAt: Date.now()
    };
  },

  buildAlerts(device, stats, status) {
    const alerts = [];
    const push = (key, severity, message) => alerts.push({ key, severity, message });

    if (status.state && status.state !== "ONLINE") {
      push("offline", "critical", `Gateway is ${status.state.toLowerCase()}`);
    }
    if (status.wanUp === false) {
      push("wan-down", "critical", "WAN / internet uplink is down");
    }
    if (status.cpuPct !== null && status.cpuPct >= this.config.cpuAlertThreshold) {
      push("cpu-high", "warning", `CPU usage is high (${Math.round(status.cpuPct)}%)`);
    }
    if (status.memPct !== null && status.memPct >= this.config.memAlertThreshold) {
      push("mem-high", "warning", `Memory usage is high (${Math.round(status.memPct)}%)`);
    }
    const updatable = device.firmwareUpdatable ?? device.upgradable ?? device.isUpdateAvailable;
    if (updatable === true) {
      push("update-available", "info", "Firmware update available");
    }

    return alerts.slice(0, this.config.maxAlerts);
  }
});

function numOrNull(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function wanUpFromUplink(uplink) {
  if (typeof uplink.up === "boolean") return uplink.up;
  if (typeof uplink.state === "string") return uplink.state.toUpperCase() !== "DOWN";
  return null;
}
