Module.register("MMM-CloudGatewayUltra", {
  defaults: {
    host: "",
    apiKey: "",
    port: 443,
    useHttp: false,
    rejectUnauthorized: false,
    siteId: "default",
    deviceId: null,
    header: "Cloud Gateway Ultra",
    updateInterval: 60 * 1000,
    animationSpeed: 1000,
    cpuAlertThreshold: 85,
    memAlertThreshold: 85,
    maxAlerts: 5,
    showStats: true,
    debug: false
  },

  start() {
    this.loaded = false;
    this.status = null;
    this.alerts = [];
    this.errorMessage = null;
    this.sendSocketNotification("CGU_INIT", this.config);
  },

  getHeader() {
    return this.config.header;
  },

  getStyles() {
    return ["MMM-CloudGatewayUltra.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "CGU_STATUS") {
      this.status = payload.status;
      this.alerts = payload.alerts;
      this.errorMessage = null;
      this.loaded = true;
      this.updateDom(this.config.animationSpeed);
    } else if (notification === "CGU_ERROR") {
      this.errorMessage = payload.message;
      this.loaded = true;
      this.updateDom(this.config.animationSpeed);
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "cgu-wrapper";

    if (!this.loaded) {
      wrapper.className += " dimmed light small";
      wrapper.innerHTML = "Loading Cloud Gateway status &hellip;";
      return wrapper;
    }

    if (this.errorMessage) {
      const err = document.createElement("div");
      err.className = "cgu-error small";
      err.innerHTML = `Cloud Gateway Ultra: ${this.errorMessage}`;
      wrapper.appendChild(err);
      return wrapper;
    }

    wrapper.appendChild(this.renderHeader());
    if (this.config.showStats) wrapper.appendChild(this.renderStats());
    wrapper.appendChild(this.renderAlerts());

    return wrapper;
  },

  renderHeader() {
    const row = document.createElement("div");
    row.className = "cgu-status-row";

    const dot = document.createElement("span");
    dot.className = `cgu-dot ${this.dotClass()}`;
    row.appendChild(dot);

    const name = document.createElement("span");
    name.className = "cgu-name bright";
    name.innerHTML = this.status.name;
    row.appendChild(name);

    const state = document.createElement("span");
    state.className = "cgu-state small dimmed";
    state.innerHTML = this.status.state;
    row.appendChild(state);

    return row;
  },

  dotClass() {
    if (this.status.state !== "ONLINE" || this.status.wanUp === false) return "cgu-dot-red";
    if (this.alerts.some((a) => a.severity === "warning")) return "cgu-dot-yellow";
    return "cgu-dot-green";
  },

  renderStats() {
    const grid = document.createElement("div");
    grid.className = "cgu-stats small";

    grid.appendChild(this.statRow("Uptime", formatUptime(this.status.uptimeSec)));
    grid.appendChild(this.statBar("CPU", this.status.cpuPct, this.config.cpuAlertThreshold));
    grid.appendChild(this.statBar("Memory", this.status.memPct, this.config.memAlertThreshold));

    if (this.status.wanIp || this.status.wanIsp) {
      const wanLabel = this.status.wanIsp ? `WAN (${this.status.wanIsp})` : "WAN";
      grid.appendChild(this.statRow(wanLabel, this.status.wanIp || (this.status.wanUp ? "up" : "down")));
    }

    return grid;
  },

  statRow(label, value) {
    const row = document.createElement("div");
    row.className = "cgu-stat-row";
    row.innerHTML = `<span class="cgu-stat-label dimmed">${label}</span><span class="cgu-stat-value">${value ?? "N/A"}</span>`;
    return row;
  },

  statBar(label, pct, threshold) {
    const row = document.createElement("div");
    row.className = "cgu-stat-row";

    if (pct === null || pct === undefined) {
      row.innerHTML = `<span class="cgu-stat-label dimmed">${label}</span><span class="cgu-stat-value">N/A</span>`;
      return row;
    }

    const level = pct >= threshold ? "cgu-bar-high" : "cgu-bar-ok";
    row.innerHTML = `
      <span class="cgu-stat-label dimmed">${label}</span>
      <span class="cgu-bar-track"><span class="cgu-bar-fill ${level}" style="width:${Math.min(100, pct)}%"></span></span>
      <span class="cgu-stat-value">${Math.round(pct)}%</span>
    `;
    return row;
  },

  renderAlerts() {
    const section = document.createElement("div");
    section.className = "cgu-alerts";

    if (!this.alerts.length) {
      section.className += " small dimmed";
      section.innerHTML = "All systems normal";
      return section;
    }

    const list = document.createElement("ul");
    list.className = "cgu-alert-list";
    this.alerts.forEach((alert) => {
      const item = document.createElement("li");
      item.className = `cgu-alert cgu-alert-${alert.severity}`;
      item.innerHTML = alert.message;
      list.appendChild(item);
    });
    section.appendChild(list);
    return section;
  }
});

function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return "N/A";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
