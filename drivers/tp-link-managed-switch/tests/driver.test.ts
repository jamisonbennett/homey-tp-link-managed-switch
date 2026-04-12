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
  });

});
