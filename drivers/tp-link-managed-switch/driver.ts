'use strict';

import fs from 'fs';
import path from 'path';
import Homey from 'homey';
import assertValidSwitchHostAddress from '../../lib/switchHostAddress';
import { assertValidSwitchPassword, assertValidSwitchUsername } from '../../lib/switchCredentials';
import { assertPairConnectionFields } from '../../lib/pairConnectionPayload';
import { assertValidPairedDeviceMacId, MAX_SWITCH_PORT_COUNT } from '../../lib/switchDeviceWebData';
import DeviceAPI from './deviceAPI';
import ManagedSwitchDevice = require('./device');

/**
 * Per-port-count device icons that ship with the driver. Only the breakpoints below have art;
 * larger switches (24, 28, ...) reuse the 16-port icon as a generic "many-port" silhouette.
 */
const PORT_ICON_BREAKPOINTS: ReadonlyArray<{ maxPorts: number; filename: string }> = [
  { maxPorts: 5, filename: '5-port.svg' },
  { maxPorts: 8, filename: '8-port.svg' },
  { maxPorts: Infinity, filename: '16-port.svg' },
];

type ManagedSwitchDeviceInstance = InstanceType<typeof ManagedSwitchDevice>;

/** Flow card args that only reference the switch device (LEDs, restart). */
interface FlowSwitchDeviceArgs {
  device: ManagedSwitchDeviceInstance;
}

/** Row returned by Flow `autocomplete` port pickers and stored on `args.port`. */
interface PortAutocompleteItem {
  name: string;
  port: number;
}

/** Flow card args that include a port number or autocomplete row (link check, port on/off). */
interface FlowSwitchPortArgs extends FlowSwitchDeviceArgs {
  port: number | PortAutocompleteItem;
}

/** Condition cards using `!{{option A|option B}}` set `state.inverted` when the second option is selected. */
interface FlowCardInvertedState {
  inverted?: boolean;
}

/** State object for flow run listeners (unused for these cards; typed for API consistency). */
type FlowCardRunState = Record<string, unknown>;

class Driver extends Homey.Driver {

  async onInit() {
    this.log('TP-Link managed switch driver has been initialized');

    const portAutocomplete = this.createPortAutocompleteListener();
    this.registerPortLinkAlarmFlowCards(portAutocomplete);

    const linkUpCondition = this.homey.flow.getConditionCard('link_up');
    linkUpCondition.registerRunListener(async (args: FlowSwitchPortArgs, _state: FlowCardRunState) => {
      const port = this.parseFlowPortArg(args);
      return args.device.isLinkUp(port);
    });

    const turnOnPortAction = this.homey.flow.getActionCard('turnOn_port');
    turnOnPortAction.registerArgumentAutocompleteListener('port', portAutocomplete);
    turnOnPortAction.registerRunListener(async (args: FlowSwitchPortArgs, _state: FlowCardRunState) => {
      const port = this.parseFlowPortArg(args);
      return args.device.onCapabilityOnoff(port, true);
    });

    const turnOffPortAction = this.homey.flow.getActionCard('turnOff_port');
    turnOffPortAction.registerArgumentAutocompleteListener('port', portAutocomplete);
    turnOffPortAction.registerRunListener(async (args: FlowSwitchPortArgs, _state: FlowCardRunState) => {
      const port = this.parseFlowPortArg(args);
      return args.device.onCapabilityOnoff(port, false);
    });

    const enablePortAction = this.homey.flow.getActionCard('enable_port');
    enablePortAction.registerRunListener(async (args: FlowSwitchPortArgs, _state: FlowCardRunState) => {
      const port = this.parseFlowPortArg(args);
      return args.device.onCapabilityOnoff(port, true);
    });

    const disablePortAction = this.homey.flow.getActionCard('disable_port');
    disablePortAction.registerRunListener(async (args: FlowSwitchPortArgs, _state: FlowCardRunState) => {
      const port = this.parseFlowPortArg(args);
      return args.device.onCapabilityOnoff(port, false);
    });

    const enableLedsAction = this.homey.flow.getActionCard('enable_leds');
    enableLedsAction.registerRunListener(async (args: FlowSwitchDeviceArgs, _state: FlowCardRunState) => {
      this.validateDeviceCardArgs(args);
      if (!args.device.getCapabilities().includes('onoff.leds')) {
        throw new Error(this.homey.__('settings.drivers.tp-link-managed-switch.flowLedsNotSupported'));
      }
      return args.device.onCapabilityOnoffLeds(true);
    });
    const disableLedsAction = this.homey.flow.getActionCard('disable_leds');
    disableLedsAction.registerRunListener(async (args: FlowSwitchDeviceArgs, _state: FlowCardRunState) => {
      this.validateDeviceCardArgs(args);
      if (!args.device.getCapabilities().includes('onoff.leds')) {
        throw new Error(this.homey.__('settings.drivers.tp-link-managed-switch.flowLedsNotSupported'));
      }
      return args.device.onCapabilityOnoffLeds(false);
    });

    const restartAction = this.homey.flow.getActionCard('restart');
    restartAction.registerRunListener(async (args: FlowSwitchDeviceArgs, _state: FlowCardRunState) => {
      this.validateDeviceCardArgs(args);
      return args.device.restart();
    });
  }

  async onPair(session: Homey.Driver.PairSession) {
    let address = '';
    let username = '';
    let password = '';
    let deviceAPI: DeviceAPI | null = null;

    session.setHandler('set_connection_info', async (data) => {
      const creds = this.parseValidatedConnectionFields(data);
      address = creds.address;
      username = creds.username;
      password = creds.password;
      await session.nextView();
      return true;
    });

    session.setHandler('showView', async (view) => {
      if (view === 'loading') {
        deviceAPI = new DeviceAPI(this, address, username, password);
        const result = await deviceAPI.connect();
        if (result) {
          await session.showView('list_devices');
        } else {
          await session.showView('connection_error');
        }
      }
    });

    session.setHandler('list_devices', async () => {
      if (deviceAPI == null) {
        return [];
      }
      const deviceData: {
        name: string;
        data: { id: string };
        store: { address: string; username: string; password: string };
        icon?: string;
      } = {
        name: deviceAPI.getName(),
        data: {
          id: deviceAPI.getMacAddress(),
        },
        store: {
          address,
          username,
          password,
        },
      };
      const icon = await this.resolveDeviceIcon(deviceAPI.getNumPorts());
      if (icon != null) {
        deviceData.icon = icon;
      }
      return [deviceData];
    });

    session.setHandler('close_connection', async () => {
      await session.done();
      return true;
    });
  }

  async onRepair(session: Homey.Driver.PairSession, device: Homey.Device) {
    let address = '';
    let username = '';
    let password = '';
    let deviceAPI: DeviceAPI | null = null;

    if (!(device instanceof ManagedSwitchDevice)) {
      throw new Error('Unsupported device');
    }
    const deviceToRepair = device as InstanceType<typeof ManagedSwitchDevice>;

    session.setHandler('getDeviceMacAddress', async (data) => {
      return {
        macAddress: deviceToRepair.getData().id,
      };
    });

    session.setHandler('getConnectionInfo', async (data) => {
      return {
        address: deviceToRepair.getAddress(),
        username: deviceToRepair.getUsername(),
      };
    });

    session.setHandler('set_connection_info', async (data) => {
      const creds = this.parseValidatedConnectionFields(data, {
        keepPasswordOnEmpty: () => deviceToRepair.getPassword(),
      });
      address = creds.address;
      username = creds.username;
      password = creds.password;
      await session.nextView();
      return true;
    });

    session.setHandler('showView', async (view) => {
      if (view === 'loading') {
        try {
          await deviceToRepair.suspendRefresh();
          deviceAPI = new DeviceAPI(this, address, username, password);
          const result = await deviceAPI.connect();
          if (result && this.isSameDevice(deviceToRepair, deviceAPI)) {
            await deviceToRepair.repair(address, username, password);
            await session.showView('done');
          } else if (result) {
            await session.showView('incorrect_device_error');
          } else {
            await session.showView('connection_error');
          }
        } catch (e) {
          this.log('repair error', e);
          await session.showView('connection_error');
        } finally {
          await deviceToRepair.resumeRefresh();
        }
      }
    });

    session.setHandler('close_connection', async () => {
      await session.done();
      return true;
    });
  }

  /**
   * Parses pair/repair `set_connection_info` payloads into validated credentials.
   * When `keepPasswordOnEmpty` is set, an empty password field reuses the existing stored password (repair flow).
   */
  private parseValidatedConnectionFields(
    data: unknown,
    options?: { keepPasswordOnEmpty: () => string },
  ): { address: string; username: string; password: string } {
    let fields;
    try {
      fields = assertPairConnectionFields(data);
    } catch {
      throw new Error(String(this.homey.__(
        'settings.drivers.tp-link-managed-switch.invalidConnectionPayload',
      )));
    }
    let address: string;
    try {
      address = assertValidSwitchHostAddress(fields.address);
    } catch {
      throw new Error(String(this.homey.__(
        'settings.drivers.tp-link-managed-switch.invalidSwitchAddress',
      )));
    }
    let username: string;
    try {
      username = assertValidSwitchUsername(fields.username);
    } catch {
      throw new Error(String(this.homey.__(
        'settings.drivers.tp-link-managed-switch.invalidSwitchUsername',
      )));
    }
    let password: string;
    if (options?.keepPasswordOnEmpty && fields.password === '') {
      password = options.keepPasswordOnEmpty();
    } else {
      try {
        password = assertValidSwitchPassword(fields.password);
      } catch {
        throw new Error(String(this.homey.__(
          'settings.drivers.tp-link-managed-switch.invalidSwitchPassword',
        )));
      }
    }
    return { address, username, password };
  }

  private validateDeviceCardArgs(args: FlowSwitchDeviceArgs) {
    if (!args.device) {
      throw new Error(String(this.homey.__(
        'settings.drivers.tp-link-managed-switch.flowSwitchDeviceNotAvailable',
      )));
    }
  }

  /**
   * Validates device + port Flow args and returns the 1-based port index.
   */
  private parseFlowPortArg(args: FlowSwitchPortArgs): number {
    this.validateDeviceCardArgs(args);
    const port = this.resolveFlowPortArg(args.port);
    if (!Number.isInteger(port) || port < 1 || port > MAX_SWITCH_PORT_COUNT) {
      throw new Error(String(this.homey.__(
        'settings.drivers.tp-link-managed-switch.flowPortNumberUnknown',
      )));
    }
    return port;
  }

  /**
   * Shared autocomplete handler for per-port Flow arguments (actions, triggers, conditions).
   */
  private createPortAutocompleteListener(): (
    query: string,
    args: { device?: ManagedSwitchDeviceInstance },
  ) => Promise<PortAutocompleteItem[]> {
    return (query, args) => Promise.resolve(this.buildPortAutocompleteResults(query, args.device));
  }

  /**
   * Resolves a Flow `port` argument from legacy numeric fields or `autocomplete` rows.
   */
  private resolveFlowPortArg(portArg: unknown): number {
    if (typeof portArg === 'number' && Number.isInteger(portArg)) {
      return portArg;
    }
    if (portArg && typeof portArg === 'object' && 'port' in portArg) {
      const p = (portArg as { port: unknown }).port;
      if (typeof p === 'number' && Number.isInteger(p)) {
        return p;
      }
    }
    throw new Error(String(this.homey.__(
      'settings.drivers.tp-link-managed-switch.flowPortNumberUnknown',
    )));
  }

  /**
   * Builds port labels for Flow autocomplete, limited to the selected device's port count.
   */
  private buildPortAutocompleteResults(
    query: string,
    device: ManagedSwitchDeviceInstance | undefined,
  ): PortAutocompleteItem[] {
    if (!device || typeof device.getSwitchPortCount !== 'function') {
      return [];
    }
    const n = device.getSwitchPortCount();
    if (n < 1) {
      return [];
    }
    const q = query.trim().toLowerCase();
    const items: PortAutocompleteItem[] = [];
    for (let p = 1; p <= n; p++) {
      const name = String(this.homey.__('settings.drivers.tp-link-managed-switch.portName', { number: p }));
      if (!q || name.toLowerCase().includes(q) || String(p).includes(q)) {
        items.push({ name, port: p });
      }
    }
    return items;
  }

  /**
   * Registers port autocomplete and run listeners for per-port disconnect/connect triggers and status condition.
   */
  private registerPortLinkAlarmFlowCards(
    portAutocomplete: (
      query: string,
      args: { device?: ManagedSwitchDeviceInstance },
    ) => Promise<PortAutocompleteItem[]>,
  ): void {
    const deviceTriggerMatcher = (
      args: { port?: PortAutocompleteItem },
      state: { port?: number },
    ): Promise<boolean> => {
      const selected = args.port?.port;
      return Promise.resolve(typeof selected === 'number' && selected === state.port);
    };

    const alarmPortTrue = this.homey.flow.getDeviceTriggerCard('alarm_port_disconnected_true');
    alarmPortTrue.registerArgumentAutocompleteListener('port', portAutocomplete);
    alarmPortTrue.registerRunListener(deviceTriggerMatcher);

    const alarmPortFalse = this.homey.flow.getDeviceTriggerCard('alarm_port_disconnected_false');
    alarmPortFalse.registerArgumentAutocompleteListener('port', portAutocomplete);
    alarmPortFalse.registerRunListener(deviceTriggerMatcher);

    const alarmPortStatus = this.homey.flow.getConditionCard('alarm_port_disconnected_status');
    alarmPortStatus.registerArgumentAutocompleteListener('port', portAutocomplete);
    alarmPortStatus.registerRunListener(async (args: FlowSwitchPortArgs, state: FlowCardInvertedState) => {
      const port = this.parseFlowPortArg(args);
      const capId = `alarm_port_disconnected.${port}`;
      if (!args.device.getCapabilities().includes(capId)) {
        throw new Error(String(this.homey.__(
          'settings.drivers.tp-link-managed-switch.flowPortAlarmCapabilityMissing',
        )));
      }
      const disconnectedRaw = await args.device.getCapabilityValue(capId);
      const isDisconnected = disconnectedRaw === true;
      const isConnected = !isDisconnected;
      return state.inverted ? isConnected : isDisconnected;
    });
  }

  /**
   * Picks the bundled per-port-count SVG so paired devices get icons that match their hardware.
   * Returns a path relative to the driver's `assets/` folder (Homey's pair `icon` convention) or `null`
   * when no suitable icon exists on disk so the driver falls back to the default device image.
   */
  private async resolveDeviceIcon(portCount: number): Promise<string | null> {
    if (!Number.isFinite(portCount) || portCount <= 0) {
      return null;
    }
    const match = PORT_ICON_BREAKPOINTS.find((entry) => portCount <= entry.maxPorts);
    if (!match) {
      return null;
    }
    const iconPath = path.join(__dirname, 'assets', 'icons', match.filename);
    try {
      await fs.promises.access(iconPath);
    } catch {
      return null;
    }
    return `/icons/${match.filename}`;
  }

  private isSameDevice(existingDevice: InstanceType<typeof ManagedSwitchDevice>, newDeviceAPI: DeviceAPI) {
    try {
      const existingMac = assertValidPairedDeviceMacId(existingDevice.getData().id);
      const newMac = assertValidPairedDeviceMacId(newDeviceAPI.getMacAddress());
      return existingMac === newMac;
    } catch {
      return false;
    }
  }
}

module.exports = Driver;
