# TP-Link Managed Switch App for Homey

Control TP-Link managed switches from Homey.

## Overview

The **TP-Link Managed Switch** app integrates TP-Link managed switches with your Homey smart home platform. You can control managed switches on your network directly from Homey and automate how they behave.

### Features
- **Port Control**: Enable or disable individual ports on your TP-Link managed switch directly from the Homey app or through Homey flows.
- **Device Integration**: Seamlessly integrate with multiple TP-Link managed switch models.
- **Automation**: Create Homey flows to automate network management tasks based on your preferences or specific conditions.
- **Status Monitoring**: View the status of each port (enabled/disabled) within the Homey app.
- **Detection of Link Changes**: Switch ports are monitored for link status every minute.


## Supported Devices
- TP-Link TL-SG105E (HW v5 & v5.6)
- TP-Link TL-SG108E (HW v6 & v6.6)
- TP-Link TL-SG116E (HW v2.20 & v2.26)
- TP-Link TL-SG1024DE (HW v4.20, v6, v6.6, v7, & v7.60)
- Additional TP-Link Easy Smart Switch hardware with firmware v1.0.0 build 20230214 or later

**TL-SG105E**

| TL-SG105E Hardware Version | Supported Firmware Version |
| -------------------------- | -------- |
| TL-SG105E v1 | Unsupported |
| TL-SG105E v2 | Unsupported |
| TL-SG105E v3 | Unsupported |
| TL-SG105E v4 | Unsupported |
| TL-SG105E v5 | 1.0.0 Build 20230214 |
| TL-SG105E v5.6 | 1.0.0 Build 20230214 |

**TL-SG108E**

| TL-SG108E Hardware Version | Supported Firmware Version |
| -------------------------- | -------- |
| TL-SG108E v1 | Unsupported |
| TL-SG108E v2 | Unsupported |
| TL-SG108E v3 | Unsupported |
| TL-SG108E v4 | Unsupported |
| TL-SG108E v5 | Unsupported |
| TL-SG108E v6 | 1.0.0 Build 20230218 |
| TL-SG108E v6.6 | 1.0.0 Build 20230218 |

**TL-SG116E**

| TL-SG116E Hardware Version | Supported Firmware Version |
| -------------------------- | -------- |
| TL-SG116E v1 | Unsupported |
| TL-SG116E v1.20 | Unsupported |
| TL-SG116E v2 | Unsupported |
| TL-SG116E v2.6 | Unsupported |
| TL-SG116E v2.20 | 1.0.0 Build 20230220 |
| TL-SG116E v2.26 | 1.0.0 Build 20230220 |

**TL-SG1024DE**

| TL-SG1024DE Hardware Version | Supported Firmware Version |
| -------------------------- | -------- |
| TL-SG1024DE v1 | Unsupported |
| TL-SG1024DE v2 | Unsupported |
| TL-SG1024DE v3 | Unsupported |
| TL-SG1024DE v4 | Unsupported |
| TL-SG1024DE v4.20 | 1.0.0 Build 20230219 |
| TL-SG1024DE v4.26 | Unsupported |
| TL-SG1024DE v6 | 1.0.0 Build 20230220 |
| TL-SG1024DE v6.6 | 1.0.0 Build 20230220 |
| TL-SG1024DE v7 | 1.0.0 Build 20230616 |
| TL-SG1024DE v7.60 | 1.0.0 Build 20230616 |

Support may require a compatible Easy Smart Switch model and up-to-date firmware.

## Installation
1. **Install the App**: Search for "TP-Link Managed Switch" in the Homey app store and install it.
2. **Add a Device**: After installing, open the Homey app and select the "TP-Link Managed Switch" app from the device list.
3. **Configure Settings**: Enter the IP address, username, and password for your TP-Link managed switch to allow Homey to communicate with it.

## Usage

### Enabling/Disabling Ports
1. **Manual Control**:
   - Open the Homey app.
   - Select your TP-Link switch from the device list.
   - Use the provided controls to enable or disable specific ports on the switch.

2. **Automated Control with Flows**:
   - Create a new flow in Homey.
   - Choose a trigger (e.g., time, device state).
   - Add an action to enable or disable a specific port on your TP-Link switch.
   - Save and activate the flow.

### Example Flows
- **Disable Guest Network at Night**: Automatically disable ports connected to guest network devices at night.
- **Enable Office Network During Working Hours**: Set up a flow to enable office network ports only during working hours.

## Troubleshooting
- **Connection Issues**: Ensure that your TP-Link managed switch is on the same network as your Homey and that the IP address, username, and password are correctly entered. If you are using an IP address, make sure your switch is configured to have a static IP address.
- **Port Control Not Working**: Verify that the switch model is supported and that the firmware is up to date.

## Known Issues
- **UI Session Logout**: TP-Link managed switch hardware allows at most one active session. When the Homey app connects to the switch, any other sessions are logged out. That happens when flows run and also about once an hour in the background.

## Contributing
We welcome contributions to enhance this app! Please submit issues or pull requests on our [GitHub repository](https://github.com/jamisonbennett/homey-tp-link-managed-switch).

## Building

### Prepare the Environment

Install the necessary dependencies: `npm install`<br />
Create the app.json:
```
cp .homeycompose/app.json .
npx homey app build
```

### Run Unit Tests

Execute the unit tests using Jest: `npx jest`

### Log in to the CLI

Log in to use the CLI: `npx homey login`

### Run the App Locally

Launch the app in development mode: `npx homey app run`

### Install the App on Homey

Deploy and install the app on your Homey device: `npx homey app install`

## License
This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for more details.

## Disclaimer
This app is an independent third-party application and is not affiliated with, endorsed by, or sponsored by TP-Link Technologies Co., Ltd. TP-Link is a registered trademark of TP-Link Technologies Co., Ltd. All product names, logos, and brands are property of their respective owners. The use of these names, logos, and brands does not imply any affiliation with or endorsement by them.
