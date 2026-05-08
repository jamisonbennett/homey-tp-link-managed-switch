'use strict';

import DeviceAPI from '../deviceAPI';

const Device = require('../device');

/** Per trigger id so tests can assert the correct device Flow card `trigger` calls. */
const deviceFlowTriggerInstances: Record<string, { trigger: jest.Mock }> = {};

jest.mock('homey', () => {
  return {
    Device: class {
      homey = {
        __: jest.fn().mockReturnValue('mockValue'),
        flow: {
          getDeviceTriggerCard: jest.fn((id: string) => {
            if (!deviceFlowTriggerInstances[id]) {
              deviceFlowTriggerInstances[id] = { trigger: jest.fn() };
            }
            return deviceFlowTriggerInstances[id];
          }),
        },
        setInterval: global.setInterval.bind(global),
        clearInterval: global.clearInterval.bind(global),
        setTimeout: global.setTimeout.bind(global),
        clearTimeout: global.clearTimeout.bind(global),
      };

      log = jest.fn();
      getStoreValue = jest.fn().mockReturnValue('mockValue');
      registerCapabilityListener = jest.fn();
      getCapabilities = jest.fn().mockReturnValue([
        'onoff.favorite',
        'onoff.leds',
        'onoff.1',
        'onoff.2',
        'onoff.3',
        'onoff.4',
        'onoff.5',
        'alarm_port_disconnected.1',
        'alarm_port_disconnected.2',
        'alarm_port_disconnected.3',
        'alarm_port_disconnected.4',
        'alarm_port_disconnected.5',
      ]);

      getCapabilityOptions = jest.fn().mockReturnValue('mockValue');
      getSetting = jest.fn().mockReturnValue('');
      getCapabilityValue = jest.fn();
      setCapabilityValue = jest.fn();
      setCapabilityOptions = jest.fn();
      setStoreValue = jest.fn();
      setSettings = jest.fn();
      setEnergy = jest.fn();
      setAvailable = jest.fn();
      setUnavailable = jest.fn();
    },
  };
});
jest.mock('../deviceAPI');

describe('Device Class Tests', () => {
  let device: InstanceType<typeof Device>;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.keys(deviceFlowTriggerInstances).forEach((k) => {
      delete deviceFlowTriggerInstances[k];
    });
    device = new Device();
    jest.spyOn(DeviceAPI.prototype, 'getNumPorts').mockReturnValue(5);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onInit', () => {
    it('should call connect on device API', async () => {
      const connectSpy = jest.spyOn(DeviceAPI.prototype, 'connect').mockResolvedValue(true);

      await device.onInit();

      expect(connectSpy).toHaveBeenCalled();
    });

    it('should handle capability listener registration', async () => {
      const registerCapabilityListenerSpy = jest.spyOn(device, 'registerCapabilityListener');

      await device.onInit();

      expect(registerCapabilityListenerSpy).toHaveBeenCalledWith('onoff.favorite', expect.any(Function));
      expect(registerCapabilityListenerSpy).toHaveBeenCalledWith('onoff.leds', expect.any(Function));
      expect(registerCapabilityListenerSpy).toHaveBeenCalledWith('onoff.1', expect.any(Function));
      expect(registerCapabilityListenerSpy).toHaveBeenCalledWith('onoff.2', expect.any(Function));
      expect(registerCapabilityListenerSpy).toHaveBeenCalledWith('onoff.3', expect.any(Function));
      expect(registerCapabilityListenerSpy).toHaveBeenCalledWith('onoff.4', expect.any(Function));
      expect(registerCapabilityListenerSpy).toHaveBeenCalledWith('onoff.5', expect.any(Function));
    });

    it('should set capability title', async () => {
      const setCapabilityOptionsSpy = jest.spyOn(device, 'setCapabilityOptions');

      await device.onInit();

      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('onoff.1', { title: 'mockValue', uiQuickAction: false });
      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('onoff.2', { title: 'mockValue', uiQuickAction: false });
      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('onoff.3', { title: 'mockValue', uiQuickAction: false });
      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('onoff.4', { title: 'mockValue', uiQuickAction: false });
      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('onoff.5', { title: 'mockValue', uiQuickAction: false });
      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('alarm_port_disconnected.1', { title: 'mockValue' });
      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('alarm_port_disconnected.2', { title: 'mockValue' });
      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('alarm_port_disconnected.3', { title: 'mockValue' });
      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('alarm_port_disconnected.4', { title: 'mockValue' });
      expect(setCapabilityOptionsSpy).toHaveBeenCalledWith('alarm_port_disconnected.5', { title: 'mockValue' });
    });

    it('should set available', async () => {
      const setAvailableSpy = jest.spyOn(device, 'setAvailable');

      await device.onInit();

      expect(setAvailableSpy).toHaveBeenCalled();
    });

    it('should set energy', async () => {
      const setEnergySpy = jest.spyOn(device, 'setEnergy');

      await device.onInit();

      expect(setEnergySpy).toHaveBeenCalledWith({ approximation: { usageConstant: 2.955 } });
    });

    it('should update device information settings', async () => {
      jest.spyOn(device, 'getStoreValue').mockImplementation((key: unknown) => {
        if (key === 'address') {
          return '192.168.1.20';
        }
        return 'mockValue';
      });
      jest.spyOn(DeviceAPI.prototype, 'getName').mockReturnValue('TL-SG108E');
      jest.spyOn(DeviceAPI.prototype, 'getMacAddress').mockReturnValue('00:11:22:33:44:55');
      jest.spyOn(DeviceAPI.prototype, 'getFirmwareVersion').mockReturnValue('1.0.0 Build 20230218 Rel.50633');
      jest.spyOn(DeviceAPI.prototype, 'getHardwareVersion').mockReturnValue('TL-SG108E 6.0');
      const setSettingsSpy = jest.spyOn(device, 'setSettings').mockResolvedValue(undefined);

      await device.onInit();

      expect(setSettingsSpy).toHaveBeenCalledWith({
        switchAddress: '192.168.1.20',
        switchName: 'TL-SG108E',
        switchMacAddress: '00:11:22:33:44:55',
        switchFirmwareVersion: '1.0.0 Build 20230218 Rel.50633',
        switchHardwareVersion: 'TL-SG108E 6.0',
        switchPortCount: '5',
      });
    });

    it('should refresh state and set capabilities correctly', async () => {
      jest.spyOn(DeviceAPI.prototype, 'getLedsEnabled').mockResolvedValue(true);
      jest.spyOn(DeviceAPI.prototype, 'getAllPortsEnabled').mockResolvedValue([true, false, true, true, true]);
      jest.spyOn(DeviceAPI.prototype, 'getAllLinksUp').mockResolvedValue([true, false, true, true, true]);
      jest.spyOn(device, 'getCapabilityValue').mockImplementation((capabilityId: unknown) => {
        if (capabilityId === 'onoff.3') {
          return true;
        }
        return false;
      });
      const setCapabilityValueSpy = jest.spyOn(device, 'setCapabilityValue').mockResolvedValue(undefined);

      await device.onInit();

      expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.favorite', true);
      expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.leds', true);
      expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.1', true);
      expect(setCapabilityValueSpy).not.toHaveBeenCalledWith('onoff.2', false);
      expect(setCapabilityValueSpy).not.toHaveBeenCalledWith('onoff.3', true);
      expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.4', true);
      expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.5', true);
      expect(setCapabilityValueSpy).toHaveBeenCalledWith('alarm_port_disconnected.2', true);
    });

    it('should set unavailable when initial connect fails', async () => {
      jest.spyOn(DeviceAPI.prototype, 'connect').mockResolvedValue(false);
      const setUnavailableSpy = jest.spyOn(device, 'setUnavailable').mockResolvedValue(undefined);

      await device.onInit();

      expect(setUnavailableSpy).toHaveBeenCalledWith('Unable to connect to managed switch');
    });
  });

  describe('onUninit', () => {
    it('aborts in-flight HTTP and clears the refresh interval after init', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
      const clearIntervalSpy = jest.spyOn(device.homey, 'clearInterval');
      jest.spyOn(DeviceAPI.prototype, 'connect').mockResolvedValue(true);
      jest.spyOn(DeviceAPI.prototype, 'getLedsEnabled').mockResolvedValue(true);
      jest.spyOn(DeviceAPI.prototype, 'getAllPortsEnabled').mockResolvedValue([true, true, true, true, true]);
      jest.spyOn(device, 'getCapabilityValue').mockReturnValue(false);
      jest.spyOn(device, 'setCapabilityValue').mockResolvedValue(undefined);

      await device.onInit();
      await device.onUninit();

      expect(abortSpy).toHaveBeenCalled();
      expect(clearIntervalSpy).toHaveBeenCalled();

      abortSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('onCapabilityOnoff', () => {
    it('should handle onCapabilityOnoff correctly', async () => {
      const setPortEnabledSpy = jest.spyOn(DeviceAPI.prototype, 'setPortEnabled').mockResolvedValue(true);

      await device.onInit();
      await device.onCapabilityOnoff(1, true);
      await device.onCapabilityOnoff(3, false);

      expect(setPortEnabledSpy).toHaveBeenCalledWith(1, true);
      expect(setPortEnabledSpy).not.toHaveBeenCalledWith(2, true);
      expect(setPortEnabledSpy).toHaveBeenCalledWith(3, false);
      expect(setPortEnabledSpy).not.toHaveBeenCalledWith(4, true);
      expect(setPortEnabledSpy).not.toHaveBeenCalledWith(5, true);
    });

    it('should reject setting ports that are not configured', async () => {
      jest.spyOn(device, 'getSetting').mockImplementation((...args: unknown[]) => {
        const [settingName] = args as [string]; // Extract and type the first argument
        if (settingName === 'favorite_port_number') {
          return 0;
        } if (settingName === 'configurable_ports') {
          return '1-3,5';
        }
        return 0; // Default return value for other settings
      });
      const setPortEnabledSpy = jest.spyOn(DeviceAPI.prototype, 'setPortEnabled').mockResolvedValue(true);

      await device.onInit();
      await device.onCapabilityOnoff(1, true);
      await device.onCapabilityOnoff(2, true);
      await device.onCapabilityOnoff(3, true);
      await expect(device.onCapabilityOnoff(4, true)).rejects.toThrow();
      await device.onCapabilityOnoff(5, true);

      expect(setPortEnabledSpy).toHaveBeenCalledWith(1, true);
      expect(setPortEnabledSpy).toHaveBeenCalledWith(2, true);
      expect(setPortEnabledSpy).toHaveBeenCalledWith(3, true);
      expect(setPortEnabledSpy).not.toHaveBeenCalledWith(4, true);
      expect(setPortEnabledSpy).toHaveBeenCalledWith(5, true);
    });
  });

  describe('onSettings configurable_ports', () => {
    it('rejects port numbers above the app maximum before expanding huge ranges', async () => {
      await device.onInit();
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { configurable_ports: '1-999999' },
          changedKeys: ['configurable_ports'],
        }),
      ).rejects.toThrow(/Port range must be within 1/);
    });

    it('rejects comma-only lists', async () => {
      await device.onInit();
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { configurable_ports: ',,' },
          changedKeys: ['configurable_ports'],
        }),
      ).rejects.toThrow(/No valid port numbers/);
    });
  });

  describe('onSettings favorite_port_number', () => {
    it('rejects a non-integer favorite port', async () => {
      await device.onInit();
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { favorite_port_number: 2.5 },
          changedKeys: ['favorite_port_number'],
        }),
      ).rejects.toThrow(/Non-integer port number/);
    });

    it('rejects a negative favorite port', async () => {
      await device.onInit();
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { favorite_port_number: -1 },
          changedKeys: ['favorite_port_number'],
        }),
      ).rejects.toThrow(/Negative port number/);
    });

    it('rejects a favorite port above the device port count', async () => {
      await device.onInit();
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { favorite_port_number: 99 },
          changedKeys: ['favorite_port_number'],
        }),
      ).rejects.toThrow(/maximum port number on this device is 5/);
    });

    it('accepts a favorite port within range', async () => {
      await device.onInit();
      await expect(
        device.onSettings({
          oldSettings: {},
          newSettings: { favorite_port_number: 3 },
          changedKeys: ['favorite_port_number'],
        }),
      ).resolves.toBeUndefined();
    });
  });

  it('should handle onCapabilityOnoffFavorite correctly', async () => {
    const setPortEnabledSpy = jest.spyOn(DeviceAPI.prototype, 'setPortEnabled').mockResolvedValue(true);

    await device.onInit();
    jest.spyOn(device, 'getSetting').mockReturnValue(2);
    await device.onCapabilityOnoffFavorite(true);

    expect(setPortEnabledSpy).not.toHaveBeenCalledWith(1, true);
    expect(setPortEnabledSpy).toHaveBeenCalledWith(2, true);
    expect(setPortEnabledSpy).not.toHaveBeenCalledWith(3, true);
    expect(setPortEnabledSpy).not.toHaveBeenCalledWith(4, true);
    expect(setPortEnabledSpy).not.toHaveBeenCalledWith(5, true);
  });

  it('onCapabilityOnoffFavorite with favorite port unset (0) refreshes state without setPortEnabled', async () => {
    const setPortEnabledSpy = jest.spyOn(DeviceAPI.prototype, 'setPortEnabled').mockResolvedValue(true);
    const getAllPortsSpy = jest.spyOn(DeviceAPI.prototype, 'getAllPortsEnabled').mockResolvedValue([
      true, true, true, true, true,
    ]);
    jest.spyOn(DeviceAPI.prototype, 'connect').mockResolvedValue(true);
    jest.spyOn(DeviceAPI.prototype, 'getLedsEnabled').mockResolvedValue(true);
    jest.spyOn(device, 'getCapabilityValue').mockReturnValue(false);
    jest.spyOn(device, 'setCapabilityValue').mockResolvedValue(undefined);
    jest.spyOn(device, 'getSetting').mockImplementation((name: unknown) => {
      if (name === 'favorite_port_number') return 0;
      return '';
    });

    await device.onInit();
    setPortEnabledSpy.mockClear();
    getAllPortsSpy.mockClear();

    await device.onCapabilityOnoffFavorite(true);

    expect(setPortEnabledSpy).not.toHaveBeenCalled();
    expect(getAllPortsSpy).toHaveBeenCalled();
  });

  it('should handle onCapabilityOnoffLeds correctly', async () => {
    const setLetdsEnabledSpy = jest.spyOn(DeviceAPI.prototype, 'setLedsEnabled').mockResolvedValue(true);

    await device.onInit();
    await device.onCapabilityOnoffLeds(true);

    expect(setLetdsEnabledSpy).toHaveBeenCalledWith(true);

    await device.onCapabilityOnoffLeds(false);

    expect(setLetdsEnabledSpy).toHaveBeenCalledWith(false);
  });

  it('should handle restart correctly', async () => {
    const resetSpy = jest.spyOn(DeviceAPI.prototype, 'restart').mockResolvedValue(true);

    await device.onInit();
    await device.restart();

    expect(resetSpy).toHaveBeenCalled();
  });

  it('should handle isLinkUp correctly', async () => {
    const isLinkUpSpy = jest.spyOn(DeviceAPI.prototype, 'isLinkUp');
    isLinkUpSpy.mockResolvedValueOnce(true);
    isLinkUpSpy.mockResolvedValueOnce(false);

    await device.onInit();
    const linkUp1 = await device.isLinkUp(1);
    const linkUp2 = await device.isLinkUp(2);

    expect(linkUp1).toEqual(true);
    expect(linkUp2).toEqual(false);

    expect(isLinkUpSpy).toHaveBeenCalledWith(1);
    expect(isLinkUpSpy).toHaveBeenCalledWith(2);
  });

  it('should connect and save credentials on repair', async () => {
    const connectSpy = jest.spyOn(DeviceAPI.prototype, 'connect').mockResolvedValue(true);
    const setStoreValueSpy = jest.spyOn(device, 'setStoreValue');

    await device.onInit();
    await device.repair('newAddress', 'newUsername', 'newPassword');

    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(setStoreValueSpy).toHaveBeenCalledWith('address', 'newAddress');
    expect(setStoreValueSpy).toHaveBeenCalledWith('username', 'newUsername');
    expect(setStoreValueSpy).toHaveBeenCalledWith('password', 'newPassword');
  });

  it('should update credentials on repair ievent if connect fails', async () => {
    const setStoreValueSpy = jest.spyOn(device, 'setStoreValue');

    await device.onInit();
    const connectSpy = jest.spyOn(DeviceAPI.prototype, 'connect').mockResolvedValue(false);
    await expect(device.repair('newAddress', 'newUsername', 'newPassword')).rejects.toThrow();

    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(setStoreValueSpy).toHaveBeenCalledWith('address', 'newAddress');
    expect(setStoreValueSpy).toHaveBeenCalledWith('username', 'newUsername');
    expect(setStoreValueSpy).toHaveBeenCalledWith('password', 'newPassword');
  });

  it('should update credentials on save', async () => {
    const setStoreValueSpy = jest.spyOn(device, 'setStoreValue');

    await device.onInit();
    await device.save();

    expect(setStoreValueSpy).toHaveBeenCalledWith('address', expect.any(String));
    expect(setStoreValueSpy).toHaveBeenCalledWith('username', expect.any(String));
    expect(setStoreValueSpy).toHaveBeenCalledWith('password', expect.any(String));
  });

  it('should refresh the state when fullRefresh() is called', async () => {
    const connectSpy = jest.spyOn(DeviceAPI.prototype, 'connect').mockResolvedValue(true);
    const setEnergySpy = jest.spyOn(device, 'setEnergy');
    const setAvailable = jest.spyOn(device, 'setAvailable');
    const setCapabilityValueSpy = jest.spyOn(device, 'setCapabilityValue').mockResolvedValue(undefined);
    jest.spyOn(DeviceAPI.prototype, 'getAllPortsEnabled').mockResolvedValue([true, true, true, true, true]);
    jest.spyOn(DeviceAPI.prototype, 'getAllLinksUp').mockResolvedValue([false, false, false, false, false]);

    await device.onInit();

    jest.spyOn(DeviceAPI.prototype, 'getAllPortsEnabled').mockResolvedValue([false, false, false, true, true]);
    await device.fullRefresh();

    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(setEnergySpy).toHaveBeenCalledWith({ approximation: { usageConstant: 2.955 } });
    expect(setAvailable).toHaveBeenCalledTimes(2);

    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.favorite', true);
    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.leds', true);
    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.1', true);
    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.2', true);
    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.3', true);
    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.4', true);
    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.5', true);
    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.1', false);
    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.2', false);
    expect(setCapabilityValueSpy).toHaveBeenCalledWith('onoff.3', false);
    expect(setCapabilityValueSpy).not.toHaveBeenCalledWith('onoff.4', false);
    expect(setCapabilityValueSpy).not.toHaveBeenCalledWith('onoff.5', false);
  });

  it('should invoke the trigger card when links go up/down', async () => {
    jest.spyOn(DeviceAPI.prototype, 'getAllPortsEnabled').mockResolvedValue([true, true, true, true, true]);
    jest.spyOn(DeviceAPI.prototype, 'getAllLinksUp').mockResolvedValue([false, false, false, true, true]);

    await device.onInit();

    const linkTriggerSpy = deviceFlowTriggerInstances.link_state_changed.trigger;
    const alarmTrueSpy = deviceFlowTriggerInstances.alarm_port_disconnected_true.trigger;
    const alarmFalseSpy = deviceFlowTriggerInstances.alarm_port_disconnected_false.trigger;

    jest.spyOn(DeviceAPI.prototype, 'getAllLinksUp').mockResolvedValue([true, false, false, true, true]);
    await device.fullRefresh();

    expect(linkTriggerSpy).toHaveBeenCalledWith(device, { port: 1, linkUp: true }, {});
    expect(alarmFalseSpy).toHaveBeenCalledWith(device, { port: 1 }, { port: 1 });

    jest.spyOn(DeviceAPI.prototype, 'getAllLinksUp').mockResolvedValue([true, false, false, false, true]);
    await device.fullRefresh();

    expect(linkTriggerSpy).toHaveBeenCalledWith(device, { port: 4, linkUp: false }, {});
    expect(alarmTrueSpy).toHaveBeenCalledWith(device, { port: 4 }, { port: 4 });
  });
});
