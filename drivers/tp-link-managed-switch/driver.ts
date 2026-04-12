'use strict';

import Homey from 'homey';
import assertValidSwitchHostAddress from '../../lib/switchHostAddress';
import { assertValidSwitchPassword, assertValidSwitchUsername } from '../../lib/switchCredentials';
import { assertPairConnectionFields } from '../../lib/pairConnectionPayload';
import { assertValidPairedDeviceMacId, MAX_SWITCH_PORT_COUNT } from '../../lib/switchDeviceWebData';
import DeviceAPI from './deviceAPI';

const Device = require('./device');

class Driver extends Homey.Driver {

  async onInit() {
    this.log('TP-Link managed switch driver has been initialized');

    const linkUpCondition = this.homey.flow.getConditionCard('link_up');
    linkUpCondition.registerRunListener(async (args: any, state: any) => {
      this.validatePortCardArgs(args);
      return args.device.isLinkUp(args.port, true);
    });

    const enablePortAction = this.homey.flow.getActionCard('enable_port');
    enablePortAction.registerRunListener(async (args: any, state: any) => {
      this.validatePortCardArgs(args);
      return args.device.onCapabilityOnoff(args.port, true);
    });

    const disablePortAction = this.homey.flow.getActionCard('disable_port');
    disablePortAction.registerRunListener(async (args: any, state: any) => {
      this.validatePortCardArgs(args);
      return args.device.onCapabilityOnoff(args.port, false);
    });

    const enableLedsAction = this.homey.flow.getActionCard('enable_leds');
    enableLedsAction.registerRunListener(async (args: any, state: any) => {
      this.validateDeviceCardArgs(args);
      return args.device.onCapabilityOnoffLeds(true);
    });
    const disableLedsAction = this.homey.flow.getActionCard('disable_leds');
    disableLedsAction.registerRunListener(async (args: any, state: any) => {
      this.validateDeviceCardArgs(args);
      return args.device.onCapabilityOnoffLeds(false);
    });

    const restartAction = this.homey.flow.getActionCard('restart');
    restartAction.registerRunListener(async (args: any, state: any) => {
      this.validateDeviceCardArgs(args);
      return args.device.restart();
    });
  }

  async onPair(session: Homey.Driver.PairSession) {
    let address = "";
    let username = "";
    let password = "";
    let deviceAPI: DeviceAPI | null = null

    session.setHandler("set_connection_info", async (data) => {
      let fields;
      try {
        fields = assertPairConnectionFields(data);
      } catch {
        throw new Error(String(this.homey.__(
          'settings.drivers.tp-link-managed-switch.invalidConnectionPayload',
        )));
      }
      try {
        address = assertValidSwitchHostAddress(fields.address);
      } catch {
        throw new Error(String(this.homey.__(
          'settings.drivers.tp-link-managed-switch.invalidSwitchAddress',
        )));
      }
      try {
        username = assertValidSwitchUsername(fields.username);
      } catch {
        throw new Error(String(this.homey.__(
          'settings.drivers.tp-link-managed-switch.invalidSwitchUsername',
        )));
      }
      try {
        password = assertValidSwitchPassword(fields.password);
      } catch {
        throw new Error(String(this.homey.__(
          'settings.drivers.tp-link-managed-switch.invalidSwitchPassword',
        )));
      }
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

    session.setHandler("list_devices", async () => {
      if (deviceAPI == null) {
        return [];
      }
      const deviceData = {
        name: deviceAPI.getName(),
        data: {
          id: deviceAPI.getMacAddress(),
        },
        store: {
          address: address,
          username: username,
          password: password,
        },
      };
      return [deviceData];
    });

    session.setHandler('close_connection', async () => {
      await session.done();
      return true;
    });
  }

  async onRepair(session: Homey.Driver.PairSession, device: Homey.Device) {
    let address = "";
    let username = "";
    let password = "";
    let deviceAPI: DeviceAPI | null = null

    const deviceToRepair = device as InstanceType<typeof Device>;
    if (!deviceToRepair) {
      throw Error('Unsupported device');
    }

    session.setHandler("getDeviceMacAddress", async (data) => {
      return {
        macAddress: deviceToRepair.getData().id
      };
    });

    session.setHandler("getConnectionInfo", async (data) => {
      return {
        address: deviceToRepair.getAddress(),
        username: deviceToRepair.getUsername(),
      };
    });

    session.setHandler("set_connection_info", async (data) => {
      let fields;
      try {
        fields = assertPairConnectionFields(data);
      } catch {
        throw new Error(String(this.homey.__(
          'settings.drivers.tp-link-managed-switch.invalidConnectionPayload',
        )));
      }
      try {
        address = assertValidSwitchHostAddress(fields.address);
      } catch {
        throw new Error(String(this.homey.__(
          'settings.drivers.tp-link-managed-switch.invalidSwitchAddress',
        )));
      }
      try {
        username = assertValidSwitchUsername(fields.username);
      } catch {
        throw new Error(String(this.homey.__(
          'settings.drivers.tp-link-managed-switch.invalidSwitchUsername',
        )));
      }
      if (fields.password == "") {
        password = deviceToRepair.getPassword();
      } else {
        try {
          password = assertValidSwitchPassword(fields.password);
        } catch {
          throw new Error(String(this.homey.__(
            'settings.drivers.tp-link-managed-switch.invalidSwitchPassword',
          )));
        }
      }
      await session.nextView();
      return true;
    });

    session.setHandler('showView', async (view) => {
      if (view === 'loading') {
        try {
          await deviceToRepair.suspendRefresh();
          deviceAPI = new DeviceAPI(this, address, username, password);
          const result = await deviceAPI.connect();
          if (result && this.isSameDevice(device, deviceAPI)) {
            await deviceToRepair.repair(address, username, password);
            await session.showView('done');
          } else if (result) {
            await session.showView('incorrect_device_error');
          } else {
            await session.showView('connection_error');
          }
        } catch (e) {
            this.log("repair error", e);
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

  private validateDeviceCardArgs(args: any) {
    if (!args.device) {
      throw Error('Switch device is not available');
    }
  }

  private validatePortCardArgs(args: any) {
    this.validateDeviceCardArgs(args);
    if (!Number.isInteger(args.port) || args.port < 1 || args.port > MAX_SWITCH_PORT_COUNT) {
      throw Error('Port number is unknown');
    }
  }

  private isSameDevice(existingDevice: InstanceType<typeof Device>, newDeviceAPI: DeviceAPI) {
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
