const NodeHelper = require("node_helper");
const { UnifiClient } = require("./unifi-client");

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.pollTimer = null;
    this.client = null;
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
    this.client = new UnifiClient(this.config, (...args) => {
      if (this.config.debug) console.log("[MMM-CloudGatewayUltra]", ...args);
    });

    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.poll(), this.config.updateInterval);
    this.poll();
  },

  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const { status, alerts } = await this.client.fetchStatus();
      this.sendSocketNotification("CGU_STATUS", { status, alerts });
    } catch (err) {
      if (this.config.debug) console.log("[MMM-CloudGatewayUltra] poll error:", err.message);
      // Force re-discovery of site/device on the next successful cycle.
      this.client.siteId = null;
      this.client.deviceId = null;
      this.sendSocketNotification("CGU_ERROR", { message: err.message });
    } finally {
      this.polling = false;
    }
  }
});
