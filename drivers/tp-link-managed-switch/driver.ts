'use strict';

import Homey from 'homey';
const Device = require('./device');
import DeviceAPI from './deviceAPI';

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
      address = data.address;
      username = data.username;
      password = data.password;
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
      address = data.address;
      username = data.username;
      password = data.password;
      if (password == "") {
        password = deviceToRepair.getPassword();
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
    if (!args.port || !Number.isInteger(args.port)) {
      throw Error('Port number is unknown');
    }
  }

  private normalizeMac(mac: string) {
    return (mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  }

  private isSameDevice(existingDevice: InstanceType<typeof Device>, newDeviceAPI: DeviceAPI) {
    return this.normalizeMac(existingDevice.getData().id) ===
      this.normalizeMac(newDeviceAPI.getMacAddress());
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Driver;
