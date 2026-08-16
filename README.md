# MMM-CloudGatewayUltra

A [MagicMirror²](https://magicmirror.builders/) module that shows live status and
alerts for a Ubiquiti Cloud Gateway Ultra (UCG-Ultra) — or any UniFi OS console
(UDM, UDM Pro, UDR, UXG, etc.) — using the official local **Network Integration
API**. No cloud account, no username/password stored on the mirror: just a local
API key.

Displays:

- Online/offline state (colored status dot)
- Uptime
- CPU and memory utilization (with warning thresholds)
- WAN/uplink status, ISP name and IP, when reported by your firmware
- Synthesized alerts: gateway offline, WAN down, high CPU/memory, firmware
  update available

> The Integration API doesn't (yet) expose a native alarms/notifications feed,
> so "alerts" here are derived by the module from device status — not pulled
> from the classic controller's alarm log.

## Requirements

- UniFi Network Application **9.3+** running on your console (UCG-Ultra ships
  with this by default on current firmware).
- MagicMirror² with Node.js 18+.
- The mirror must be able to reach the gateway's IP on your LAN.

## 1. Generate a local API key

1. Open the UniFi Network web app (`https://<gateway-ip>/network/default/settings`)
   or the UniFi OS console UI.
2. Go to **Settings → Control Plane → Integrations** (on some firmware
   versions this is under **Settings → System → Advanced → API**).
3. Create a new API key, give it a name (e.g. `magicmirror`), and **copy it
   immediately** — it's shown only once.

## 2. Install the module

```bash
cd ~/MagicMirror/modules
git clone <this-repo-url> MMM-CloudGatewayUltra
```

(No `npm install` needed — the module has zero external dependencies.)

## 3. Configure

Add to `~/MagicMirror/config/config.js`:

```js
{
  module: "MMM-CloudGatewayUltra",
  position: "top_right",
  config: {
    host: "192.168.1.1",        // your gateway's LAN IP or hostname
    apiKey: "YOUR_API_KEY_HERE",
    updateInterval: 60 * 1000,  // poll every 60s
    cpuAlertThreshold: 85,
    memAlertThreshold: 85
  }
}
```

### All config options

| Option               | Default                | Description                                                                                     |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `host`               | `""` (required)         | Gateway IP or hostname.                                                                          |
| `apiKey`             | `""` (required)         | API key from step 1.                                                                             |
| `port`               | `443`                   | UniFi OS consoles use `443`.                                                                     |
| `useHttp`            | `false`                 | Set `true` only if your console is reachable over plain HTTP (rare).                             |
| `rejectUnauthorized` | `false`                 | Local consoles use a self-signed cert by default, so TLS verification is off by default.         |
| `siteId`             | `"default"`             | Leave as-is unless you run multiple sites; you can also pass a specific site UUID.               |
| `deviceId`           | `null`                  | Gateway's device id or MAC address. Auto-detected by model name if omitted; set this if it fails to auto-detect on your hardware. |
| `header`             | `"Cloud Gateway Ultra"` | Module header text.                                                                              |
| `updateInterval`     | `60000`                 | Poll interval in ms. Don't go much below 30s.                                                    |
| `cpuAlertThreshold`  | `85`                    | CPU % that triggers a warning alert.                                                             |
| `memAlertThreshold`  | `85`                    | Memory % that triggers a warning alert.                                                          |
| `maxAlerts`          | `5`                     | Max number of alerts shown at once.                                                              |
| `showStats`          | `true`                  | Toggle the uptime/CPU/memory/WAN block.                                                          |
| `debug`              | `false`                 | Logs raw API responses to the MagicMirror server console — useful if fields differ on your firmware. |

## Testing without MagicMirror installed

`bin/check-status.js` runs the exact same client code the module uses, outside
of MagicMirror, and prints everything it fetched and parsed. Useful before
you've even installed MagicMirror, or any time you want to check field names
for your firmware:

```bash
CGU_HOST=192.168.1.1 CGU_API_KEY=your_key node bin/check-status.js
```

It prints the resolved site/device ids, the raw JSON your console returned,
the parsed status object, and any computed alerts — so you can confirm
connectivity and see real field names before wiring it into `config.js`.

## Troubleshooting

- **"Could not auto-detect the gateway device"** — set `deviceId` explicitly.
  Turn on `debug: true`, restart MagicMirror, and check the server console/log
  for the `devices:` line to find your gateway's `id` or `macAddress`.
- **Stats show "N/A"** — the exact JSON fields returned by
  `/statistics/latest` can vary by firmware/Network Application version. Turn
  on `debug: true` and check the `stats:` log line; open an issue with the
  field names your console actually returns.
- **Connection errors / certificate errors** — local UniFi OS consoles use a
  self-signed certificate by default, which is why `rejectUnauthorized`
  defaults to `false`. Only enable it if you've installed a trusted cert.

## Notes

This module talks directly to your gateway over your LAN — nothing leaves
your network, and no UniFi cloud account is involved.
