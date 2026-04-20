# TP-Link Managed Switch for Homey

This **`README.md`** is the project documentation for **GitHub**. The long description for the **Homey App Store** is maintained separately in [`README.txt`](./README.txt); keep user-facing facts in sync when you change either file.

Connect [TP-Link Easy Smart Switch](https://www.tp-link.com/) managed switches to **Homey** so you can enable or disable ports, react to link up/down, and automate small network tasks from flows.

**Requirements:** Homey with support for **local** apps (see compatibility in [`app.json`](./app.json)), firmware **≥ 12**. The switch must be reachable on the **same LAN** as your Homey (wired or Wi‑Fi). A **static IP** (or DHCP reservation) for the switch is strongly recommended.

---

## What you can do

- **Per-port enable/disable** — Each port appears as its own toggle in the device view; turning it off disables the switch port (capability `onoff.<port>`).
- **Favorite port** — One port exposed as **Favorite Port** for quick access (`onoff.favorite`); set the port number in device settings (0 = off).
- **Front LEDs** — Toggle switch LEDs from the device (`onoff.leds`) or from a flow.
- **Flows**
  - **Trigger:** “Switch port state changed” when a port’s link goes up or down (tokens: port number, link up/down).
  - **Condition:** “Switch port link is up/down” for a chosen port.
  - **Actions:** Enable/disable a port, enable/disable LEDs, **restart** the switch.
- **Background refresh** — Port and link state are refreshed about every minute; the app also re-authenticates periodically so the session stays valid.

---

## Supported hardware

The models below match hardware revisions and firmware builds that **TP-Link documentation** associates with Easy Smart Switch web management compatible with this app. Other **Easy Smart Switch** models may work if they expose the same web UI and a compatible firmware generation.

* Additional TP-Link Easy Smart Switch hardware with firmware **v1.0.0 build 20230214** or later (where applicable)

**TL-SG105E**

| Hardware version | Supported firmware |
| ---------------- | ------------------- |
| TL-SG105E v1–v4 | Not supported |
| TL-SG105E v5 | 1.0.0 Build 20230214 |
| TL-SG105E v5.6 | 1.0.0 Build 20230214 |

**TL-SG105PE**

| Hardware version | Supported firmware |
| ---------------- | ------------------- |
| TL-SG105E v1–v2.46 | Not supported |
| TL-SG105E v2.60 | 1.0.0 Build 20230218 |

**TL-SG108E**

| Hardware version | Supported firmware |
| ---------------- | ------------------- |
| TL-SG108E v1–v5 | Not supported |
| TL-SG108E v6 | 1.0.0 Build 20230218 |
| TL-SG108E v6.6 | 1.0.0 Build 20230218 |

**TL-SG108PE**

| Hardware version | Supported firmware |
| ---------------- | ------------------- |
| TL-SG108PE v1–v3.80 | Not supported |
| TL-SG108PE v4 | 1.0.0 Build 20230218 |
| TL-SG108PE v4.20 | 1.0.0 Build 20230711 |
| TL-SG108PE v4.60 | 1.0.0 Build 20230218 |
| TL-SG108PE v5 | 1.0.0 Build 20230218 |
| TL-SG108PE v5.46 | Unknown |
| TL-SG108PE v5.60 | 1.0.0 Build 20230218 |

**TL-SG116E**

| Hardware version | Supported firmware |
| ---------------- | ------------------- |
| TL-SG116E v1, v1.20, v2, v2.60 | Not supported |
| TL-SG116E v2.20 | 1.0.0 Build 20230220 |
| TL-SG116E v2.26 | 1.0.0 Build 20230220 |

**TL-SG1016PE**

| Hardware version | Supported firmware |
| ---------------- | ------------------- |
| TL-SG1016PE v1, v2, v3, v3.20, v3.26, v3.60 | Not supported |
| TL-SG1016PE v5 | 1.0.0 Build 20230219 |
| TL-SG1016PE v5.20 | 1.0.0 Build 20230712 |
| TL-SG1016PE v5.26 | 1.0.0 Build 20230220 |
| TL-SG1016PE v5.60 | 1.0.0 Build 20230219 |
| TL-SG1016PE v6, v6.6 | Unknown |

**TL-SG1024DE**

| Hardware version | Supported firmware |
| ---------------- | ------------------- |
| TL-SG1024DE v1–v4 | Not supported |
| TL-SG1024DE v4.20 | 1.0.0 Build 20230219 |
| TL-SG1024DE v4.26 | Not supported |
| TL-SG1024DE v6 | 1.0.0 Build 20230220 |
| TL-SG1024DE v6.6 | 1.0.0 Build 20230220 |
| TL-SG1024DE v7 | 1.0.0 Build 20230616 |
| TL-SG1024DE v7.60 | 1.0.0 Build 20230616 |

**TL-SG1428PE**

| Hardware version | Supported firmware |
| ---------------- | ------------------- |
| TL-SG1428PE v1, v1.20, v1.26 | Not supported |
| TL-SG1428PE v2 | 1.0.0 Build 20230219 |
| TL-SG1428PE v2.20 | 1.0.0 Build 20230219 |
| TL-SG1428PE v2.60 | 1.0.0 Build 20230219 |
| TL-SG1428PE v3 | 1.0.0 Build 20230220 |
| TL-SG1428PE v3.60 | 1.0.0 Build 20230220 |

---

## Installation

1. Install **TP-Link Managed Switch** from the [Homey App Store](https://homey.app) (or run from source; see [Building](#building)).
2. In the Homey mobile app, add a device and choose **TP-Link Managed Switch**.
3. Enter the switch **IP address** and the same **username** and **password** you use for the switch’s web interface.

### Device settings

- **Favorite port** — Port number for the Favorite Port tile, or `0` to hide it.
- **Configurable ports** — Optional allowlist so only certain ports can be controlled (empty = all ports). Format: comma-separated numbers and ranges, spaces ignored, e.g. `1-3,5,6-10,14`.

---

## Usage

**From the device** — Use per-port enable/disable toggles, Favorite Port, and the LED toggle as needed.

**From flows** — Use the flow cards under this app to enable/disable ports, control LEDs, restart the switch, or branch on link state. Example ideas:

- Disable guest Wi‑Fi uplink ports at night.
- Notify when a critical device’s link drops (link-changed trigger).
- Disable LEDs in a bedroom closet switch when a “quiet hours” mode is on.

---

## Troubleshooting

| Problem | What to check |
| ------- | ------------- |
| Homey cannot connect | Same subnet as Homey, correct IP, ping from your network. Prefer static IP or DHCP reservation. |
| Login fails | Username/password match the **web UI** (not cloud-only accounts). |
| Port actions do nothing | Model/firmware supported; **Configurable ports** setting not excluding that port. |
| Web UI kicks you out | Expected: the switch allows **one** management session. See [Known issues](#known-issues). |

---

## Known issues

**Single web session** — TP-Link Easy Smart Switch devices typically allow only one active web session. When this app talks to the switch (including periodic re-login about once an hour), **other browser sessions** to the same switch may be logged out.

---

## Contributing

Issues and pull requests are welcome on GitHub: [github.com/jamisonbennett/homey-tp-link-managed-switch](https://github.com/jamisonbennett/homey-tp-link-managed-switch).

---

## Building

Use **Node.js 22+**. Run `npm install`, then use the [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started/homey-cli) via `npx homey`.

```bash
npm install
npx homey app run        # run on your Homey (development)
npx homey app validate   # check app.json and structure before publish
npx homey app install    # install this folder on your Homey
```

Log in once when needed: `npx homey login`.

This app is written in TypeScript. For a local compile (e.g. CI), run `npm run build` (output under `.homeybuild/`). Unit tests: `npm test`.

### Homey Compose

Metadata and drivers are merged from **Homey Compose** sources under [`.homeycompose/`](./.homeycompose/) and [`drivers/tp-link-managed-switch/driver.*.compose.json`](./drivers/tp-link-managed-switch/). The root [`app.json`](./app.json) is **regenerated** when you use the CLI (for example `homey app run` or `homey app build`); edit the compose files, not `app.json`, by hand.

---

## License

This project is licensed under the MIT License; see [LICENSE](./LICENSE).

## Disclaimer

This app is an independent third-party application and is not affiliated with, endorsed by, or sponsored by TP-Link Technologies Co., Ltd. TP-Link is a registered trademark of TP-Link Technologies Co., Ltd. All product names, logos, and brands are property of their respective owners. The use of these names, logos, and brands does not imply any affiliation with or endorsement by them.
