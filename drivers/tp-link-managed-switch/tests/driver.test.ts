'use strict';

import Homey from 'homey';
const ManagedSwitchDevice = require('../device');
import DeviceAPI from '../deviceAPI';
const Driver = require('../driver');

jest.mock('homey', () => {
  return {
    Device: class {
      log = jest.fn();
    },
    Driver: class {
      log = jest.fn();
    },
  };
});
jest.mock('../device');
jest.mock('../deviceAPI');

describe('Driver', () => {
  let driver: any;

  beforeEach(async () => {
    driver = new Driver();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onInit', () => {
    it('should initialize and register flow cards correctly', async () => {
      const mockFlow = {
        getConditionCard: jest.fn().mockReturnValue({
          registerRunListener: jest.fn(),
        }),
        getActionCard: jest.fn().mockReturnValue({
          registerRunListener: jest.fn(),
        }),
      };

      driver.homey = { flow: mockFlow };

      await driver.onInit();

      expect(mockFlow.getConditionCard).toHaveBeenCalledWith('link_up');
      expect(mockFlow.getActionCard).toHaveBeenCalledWith('enable_port');
      expect(mockFlow.getActionCard).toHaveBeenCalledWith('disable_port');
      expect(mockFlow.getActionCard).toHaveBeenCalledWith('enable_leds');
      expect(mockFlow.getActionCard).toHaveBeenCalledWith('disable_leds');
      expect(mockFlow.getActionCard).toHaveBeenCalledWith('restart');
    });
  });

  describe('onPair', () => {
    it('should handle device pairing correctly', async () => {
      const mockSession = {
        setHandler: jest.fn(),
        nextView: jest.fn(),
        showView: jest.fn(),
        done: jest.fn(),
      };

      await driver.onPair(mockSession);

      expect(mockSession.setHandler).toHaveBeenCalledWith('set_connection_info', expect.any(Function));
      expect(mockSession.setHandler).toHaveBeenCalledWith('showView', expect.any(Function));
      expect(mockSession.setHandler).toHaveBeenCalledWith('list_devices', expect.any(Function));
      expect(mockSession.setHandler).toHaveBeenCalledWith('close_connection', expect.any(Function));
    });

    it('set_connection_info rejects invalid payload before field validation', async () => {
      const mockSession = {
        setHandler: jest.fn(),
        nextView: jest.fn(),
        showView: jest.fn(),
        done: jest.fn(),
      };
      const __ = jest.fn((key: string) => `t:${key}`);
      driver.homey = { __, flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      await driver.onPair(mockSession);

      const handlerEntry = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      expect(handlerEntry).toBeDefined();
      const handler = handlerEntry![1] as (data: unknown) => Promise<unknown>;

      await expect(handler(null)).rejects.toThrow('t:settings.drivers.tp-link-managed-switch.invalidConnectionPayload');
      expect(__).toHaveBeenCalledWith('settings.drivers.tp-link-managed-switch.invalidConnectionPayload');
    });
  });

  describe('onRepair', () => {
    it('should handle device repair correctly', async () => {
      const mockSession = {
        setHandler: jest.fn(),
        nextView: jest.fn(),
        showView: jest.fn(),
        done: jest.fn(),
      };

      const mockDevice = Object.create(ManagedSwitchDevice.prototype) as InstanceType<
        typeof ManagedSwitchDevice
      >;
      mockDevice.getData = jest.fn().mockReturnValue({ id: '00:11:22:33:44:55' });
      mockDevice.repair = jest.fn();

      await driver.onRepair(mockSession, mockDevice);

      expect(mockSession.setHandler).toHaveBeenCalledWith('getDeviceMacAddress', expect.any(Function));
      expect(mockSession.setHandler).toHaveBeenCalledWith('set_connection_info', expect.any(Function));
      expect(mockSession.setHandler).toHaveBeenCalledWith('showView', expect.any(Function));
      expect(mockSession.setHandler).toHaveBeenCalledWith('close_connection', expect.any(Function));
    });

    it('should throw an error if the device is unsupported', async () => {
      const mockSession = {
        setHandler: jest.fn(),
      };

      await expect(driver.onRepair(mockSession, null as unknown as Homey.Device)).rejects.toThrow(
        'Unsupported device',
      );
      await expect(
        driver.onRepair(mockSession, { getData: jest.fn() } as unknown as Homey.Device),
      ).rejects.toThrow('Unsupported device');
    });

    it('repair set_connection_info reuses stored password when the password field is empty', async () => {
      const mockSession = {
        setHandler: jest.fn(),
        nextView: jest.fn().mockResolvedValue(undefined),
        showView: jest.fn().mockResolvedValue(undefined),
        done: jest.fn(),
      };

      const storedPassword = 'password-kept-from-device';
      const mockDevice = Object.create(ManagedSwitchDevice.prototype) as InstanceType<
        typeof ManagedSwitchDevice
      >;
      mockDevice.getData = jest.fn().mockReturnValue({ id: '00:11:22:33:44:55' });
      mockDevice.getPassword = jest.fn().mockReturnValue(storedPassword);
      mockDevice.getAddress = jest.fn().mockReturnValue('192.168.1.2');
      mockDevice.getUsername = jest.fn().mockReturnValue('prior-user');
      mockDevice.suspendRefresh = jest.fn().mockResolvedValue(undefined);
      mockDevice.resumeRefresh = jest.fn().mockResolvedValue(undefined);
      mockDevice.repair = jest.fn().mockResolvedValue(undefined);

      const connect = jest.fn().mockResolvedValue(true);
      const getMacAddress = jest.fn().mockReturnValue('00:11:22:33:44:55');
      (DeviceAPI as jest.Mock).mockImplementationOnce(() => ({ connect, getMacAddress }));

      driver.homey = { __: jest.fn((key: string) => key), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      await driver.onRepair(mockSession, mockDevice);

      const setConn = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      expect(setConn).toBeDefined();
      const setConnectionHandler = setConn![1] as (data: unknown) => Promise<unknown>;

      await setConnectionHandler({ address: '192.168.1.10', username: 'admin', password: '' });

      expect(mockDevice.getPassword).toHaveBeenCalled();
      expect(mockSession.nextView).toHaveBeenCalled();

      const showViewEntry = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'showView');
      expect(showViewEntry).toBeDefined();
      const showViewHandler = showViewEntry![1] as (view: string) => Promise<void>;
      await showViewHandler('loading');

      expect(DeviceAPI).toHaveBeenCalledWith(driver, '192.168.1.10', 'admin', storedPassword);
      expect(mockDevice.repair).toHaveBeenCalledWith('192.168.1.10', 'admin', storedPassword);
    });
  });

});
