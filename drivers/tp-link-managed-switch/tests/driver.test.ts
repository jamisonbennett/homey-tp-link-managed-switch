'use strict';

import DeviceAPI from '../deviceAPI';

const ManagedSwitchDevice = require('../device');
const Driver = require('../driver');

jest.mock('homey', () => {
  class MockHomeyBase {
    log = jest.fn();
  }
  return {
    Device: MockHomeyBase,
    Driver: MockHomeyBase,
  };
});
jest.mock('../device');
jest.mock('../deviceAPI');

describe('Driver', () => {
  let driver: InstanceType<typeof Driver>;

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

  describe('flow card run listeners', () => {
    const conditionRunListeners: Record<string, (args: unknown, state: unknown) => Promise<unknown>> = {};
    const actionRunListeners: Record<string, (args: unknown, state: unknown) => Promise<unknown>> = {};

    beforeEach(async () => {
      driver.homey = {
        __: jest.fn((key: string) => `t:${key}`),
        flow: {
          getConditionCard: jest.fn((id: string) => ({
            registerRunListener: jest.fn((fn: (args: unknown, state: unknown) => Promise<unknown>) => {
              conditionRunListeners[id] = fn;
            }),
          })),
          getActionCard: jest.fn((id: string) => ({
            registerRunListener: jest.fn((fn: (args: unknown, state: unknown) => Promise<unknown>) => {
              actionRunListeners[id] = fn;
            }),
          })),
        },
      };
      await driver.onInit();
    });

    afterEach(() => {
      Object.keys(conditionRunListeners).forEach((k) => delete conditionRunListeners[k]);
      Object.keys(actionRunListeners).forEach((k) => delete actionRunListeners[k]);
    });

    it('link_up delegates to device.isLinkUp(port)', async () => {
      const device = { isLinkUp: jest.fn().mockResolvedValue(true) };
      const result = await conditionRunListeners['link_up']({ device, port: 2 }, {});
      expect(result).toBe(true);
      expect(device.isLinkUp).toHaveBeenCalledWith(2);
    });

    it('enable_port and disable_port delegate to onCapabilityOnoff', async () => {
      const device = { onCapabilityOnoff: jest.fn().mockResolvedValue(undefined) };
      await actionRunListeners['enable_port']({ device, port: 1 }, {});
      await actionRunListeners['disable_port']({ device, port: 3 }, {});
      expect(device.onCapabilityOnoff).toHaveBeenCalledWith(1, true);
      expect(device.onCapabilityOnoff).toHaveBeenCalledWith(3, false);
    });

    it('LED and restart actions delegate to the device', async () => {
      const device = {
        onCapabilityOnoffLeds: jest.fn().mockResolvedValue(undefined),
        restart: jest.fn().mockResolvedValue(undefined),
      };
      await actionRunListeners['enable_leds']({ device }, {});
      await actionRunListeners['disable_leds']({ device }, {});
      await actionRunListeners['restart']({ device }, {});
      expect(device.onCapabilityOnoffLeds).toHaveBeenCalledWith(true);
      expect(device.onCapabilityOnoffLeds).toHaveBeenCalledWith(false);
      expect(device.restart).toHaveBeenCalled();
    });

    it('rejects port flows when device is missing', async () => {
      await expect(conditionRunListeners['link_up']({ port: 1 }, {})).rejects.toThrow(
        't:settings.drivers.tp-link-managed-switch.flowSwitchDeviceNotAvailable',
      );
      await expect(actionRunListeners['enable_port']({ port: 1 }, {})).rejects.toThrow(
        't:settings.drivers.tp-link-managed-switch.flowSwitchDeviceNotAvailable',
      );
    });

    it('rejects port flows when port is out of range or not an integer', async () => {
      const device = { isLinkUp: jest.fn(), onCapabilityOnoff: jest.fn() };
      await expect(conditionRunListeners['link_up']({ device, port: 0 }, {})).rejects.toThrow(
        't:settings.drivers.tp-link-managed-switch.flowPortNumberUnknown',
      );
      await expect(conditionRunListeners['link_up']({ device, port: 49 }, {})).rejects.toThrow(
        't:settings.drivers.tp-link-managed-switch.flowPortNumberUnknown',
      );
      await expect(conditionRunListeners['link_up']({ device, port: 1.2 }, {})).rejects.toThrow(
        't:settings.drivers.tp-link-managed-switch.flowPortNumberUnknown',
      );
      expect(device.isLinkUp).not.toHaveBeenCalled();
    });

    it('rejects device-only flows when device is missing', async () => {
      await expect(actionRunListeners['restart']({}, {})).rejects.toThrow(
        't:settings.drivers.tp-link-managed-switch.flowSwitchDeviceNotAvailable',
      );
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

    it('list_devices returns an empty list before loading has created a DeviceAPI', async () => {
      const mockSession = {
        setHandler: jest.fn(), nextView: jest.fn(), showView: jest.fn(), done: jest.fn(),
      };
      driver.homey = { __: jest.fn((k: string) => k), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      await driver.onPair(mockSession);

      const listEntry = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'list_devices');
      expect(listEntry).toBeDefined();
      const listDevices = listEntry![1] as () => Promise<unknown>;
      await expect(listDevices()).resolves.toEqual([]);
    });

    it('showView loading shows list_devices when connect succeeds', async () => {
      const mockSession = {
        setHandler: jest.fn(), nextView: jest.fn(), showView: jest.fn(), done: jest.fn(),
      };
      driver.homey = { __: jest.fn((k: string) => k), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      (DeviceAPI as jest.Mock).mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(true),
        getName: jest.fn().mockReturnValue('My Switch'),
        getMacAddress: jest.fn().mockReturnValue('00:11:22:33:44:55'),
        getNumPorts: jest.fn().mockReturnValue(8),
      }));

      await driver.onPair(mockSession);

      const setConn = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      await (setConn![1] as (d: unknown) => Promise<unknown>)({
        address: '192.168.1.20',
        username: 'admin',
        password: 'secret',
      });

      const showViewEntry = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'showView');
      await (showViewEntry![1] as (v: string) => Promise<void>)('loading');

      expect(mockSession.showView).toHaveBeenCalledWith('list_devices');

      const listDevices = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'list_devices')![
        1
      ] as () => Promise<unknown>;
      const devices = await listDevices();
      expect(devices).toEqual([
        {
          name: 'My Switch',
          data: { id: '00:11:22:33:44:55' },
          store: { address: '192.168.1.20', username: 'admin', password: 'secret' },
          icon: '/icons/8-port.svg',
        },
      ]);
    });

    it.each([
      [5, '/icons/5-port.svg'],
      [8, '/icons/8-port.svg'],
      [16, '/icons/16-port.svg'],
      [24, '/icons/16-port.svg'],
      [28, '/icons/16-port.svg'],
    ])('list_devices assigns the correct icon for %i ports', async (numPorts, expectedIcon) => {
      const mockSession = {
        setHandler: jest.fn(), nextView: jest.fn(), showView: jest.fn(), done: jest.fn(),
      };
      driver.homey = { __: jest.fn((k: string) => k), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      (DeviceAPI as jest.Mock).mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(true),
        getName: jest.fn().mockReturnValue('My Switch'),
        getMacAddress: jest.fn().mockReturnValue('00:11:22:33:44:55'),
        getNumPorts: jest.fn().mockReturnValue(numPorts),
      }));

      await driver.onPair(mockSession);

      const setConn = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      await (setConn![1] as (d: unknown) => Promise<unknown>)({
        address: '192.168.1.20',
        username: 'admin',
        password: 'secret',
      });

      const showViewEntry = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'showView');
      await (showViewEntry![1] as (v: string) => Promise<void>)('loading');

      const listDevices = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'list_devices')![
        1
      ] as () => Promise<Array<{ icon?: string }>>;
      const [device] = await listDevices();
      expect(device.icon).toBe(expectedIcon);
    });

    it('list_devices omits the icon when port count is unknown', async () => {
      const mockSession = {
        setHandler: jest.fn(), nextView: jest.fn(), showView: jest.fn(), done: jest.fn(),
      };
      driver.homey = { __: jest.fn((k: string) => k), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      (DeviceAPI as jest.Mock).mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(true),
        getName: jest.fn().mockReturnValue('My Switch'),
        getMacAddress: jest.fn().mockReturnValue('00:11:22:33:44:55'),
        getNumPorts: jest.fn().mockReturnValue(0),
      }));

      await driver.onPair(mockSession);

      const setConn = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      await (setConn![1] as (d: unknown) => Promise<unknown>)({
        address: '192.168.1.20',
        username: 'admin',
        password: 'secret',
      });

      const showViewEntry = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'showView');
      await (showViewEntry![1] as (v: string) => Promise<void>)('loading');

      const listDevices = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'list_devices')![
        1
      ] as () => Promise<Array<{ icon?: string }>>;
      const [device] = await listDevices();
      expect(device.icon).toBeUndefined();
    });

    it('showView loading shows connection_error when connect fails', async () => {
      const mockSession = {
        setHandler: jest.fn(), nextView: jest.fn(), showView: jest.fn(), done: jest.fn(),
      };
      driver.homey = { __: jest.fn((k: string) => k), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      (DeviceAPI as jest.Mock).mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(false),
      }));

      await driver.onPair(mockSession);

      const setConn = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      await (setConn![1] as (d: unknown) => Promise<unknown>)({
        address: '192.168.1.20',
        username: 'admin',
        password: 'secret',
      });

      const showViewEntry = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'showView');
      await (showViewEntry![1] as (v: string) => Promise<void>)('loading');

      expect(mockSession.showView).toHaveBeenCalledWith('connection_error');
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

      await expect(driver.onRepair(mockSession, null as unknown as InstanceType<typeof ManagedSwitchDevice>)).rejects.toThrow(
        'Unsupported device',
      );
      await expect(
        driver.onRepair(mockSession, { getData: jest.fn() } as unknown as InstanceType<typeof ManagedSwitchDevice>),
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

    function makeRepairableDevice(options?: { suspendRefresh?: jest.Mock }) {
      const mockDevice = Object.create(ManagedSwitchDevice.prototype) as InstanceType<
        typeof ManagedSwitchDevice
      >;
      mockDevice.getData = jest.fn().mockReturnValue({ id: '00:11:22:33:44:55' });
      mockDevice.getPassword = jest.fn().mockReturnValue('pw');
      mockDevice.getAddress = jest.fn().mockReturnValue('192.168.1.2');
      mockDevice.getUsername = jest.fn().mockReturnValue('admin');
      mockDevice.suspendRefresh = options?.suspendRefresh ?? jest.fn().mockResolvedValue(undefined);
      mockDevice.resumeRefresh = jest.fn().mockResolvedValue(undefined);
      mockDevice.repair = jest.fn().mockResolvedValue(undefined);
      return mockDevice;
    }

    it('repair showView loading shows done and repairs when MAC matches', async () => {
      const mockSession = {
        setHandler: jest.fn(),
        nextView: jest.fn().mockResolvedValue(undefined),
        showView: jest.fn().mockResolvedValue(undefined),
        done: jest.fn(),
      };
      const mockDevice = makeRepairableDevice();

      (DeviceAPI as jest.Mock).mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(true),
        getMacAddress: jest.fn().mockReturnValue('00:11:22:33:44:55'),
      }));

      driver.homey = { __: jest.fn((key: string) => key), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      await driver.onRepair(mockSession, mockDevice);

      const setConn = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      await (setConn![1] as (d: unknown) => Promise<unknown>)({
        address: '192.168.1.30',
        username: 'admin',
        password: 'newsecret',
      });

      const showViewHandler = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'showView')![
        1
      ] as (view: string) => Promise<void>;
      await showViewHandler('loading');

      expect(mockDevice.suspendRefresh).toHaveBeenCalled();
      expect(mockDevice.repair).toHaveBeenCalledWith('192.168.1.30', 'admin', 'newsecret');
      expect(mockSession.showView).toHaveBeenCalledWith('done');
      expect(mockDevice.resumeRefresh).toHaveBeenCalled();
    });

    it('repair showView loading shows incorrect_device_error when MAC differs', async () => {
      const mockSession = {
        setHandler: jest.fn(),
        nextView: jest.fn().mockResolvedValue(undefined),
        showView: jest.fn().mockResolvedValue(undefined),
        done: jest.fn(),
      };
      const mockDevice = makeRepairableDevice();

      (DeviceAPI as jest.Mock).mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(true),
        getMacAddress: jest.fn().mockReturnValue('aa:bb:cc:dd:ee:ff'),
      }));

      driver.homey = { __: jest.fn((key: string) => key), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      await driver.onRepair(mockSession, mockDevice);

      const setConn = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      await (setConn![1] as (d: unknown) => Promise<unknown>)({
        address: '192.168.1.30',
        username: 'admin',
        password: 'newsecret',
      });

      const showViewHandler = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'showView')![
        1
      ] as (view: string) => Promise<void>;
      await showViewHandler('loading');

      expect(mockSession.showView).toHaveBeenCalledWith('incorrect_device_error');
      expect(mockDevice.repair).not.toHaveBeenCalled();
      expect(mockDevice.resumeRefresh).toHaveBeenCalled();
    });

    it('repair showView loading shows connection_error when connect fails', async () => {
      const mockSession = {
        setHandler: jest.fn(),
        nextView: jest.fn().mockResolvedValue(undefined),
        showView: jest.fn().mockResolvedValue(undefined),
        done: jest.fn(),
      };
      const mockDevice = makeRepairableDevice();

      (DeviceAPI as jest.Mock).mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(false),
      }));

      driver.homey = { __: jest.fn((key: string) => key), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      await driver.onRepair(mockSession, mockDevice);

      const setConn = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      await (setConn![1] as (d: unknown) => Promise<unknown>)({
        address: '192.168.1.30',
        username: 'admin',
        password: 'newsecret',
      });

      const showViewHandler = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'showView')![
        1
      ] as (view: string) => Promise<void>;
      await showViewHandler('loading');

      expect(mockSession.showView).toHaveBeenCalledWith('connection_error');
      expect(mockDevice.repair).not.toHaveBeenCalled();
      expect(mockDevice.resumeRefresh).toHaveBeenCalled();
    });

    it('repair showView loading shows connection_error on exception and still resumes refresh', async () => {
      const mockSession = {
        setHandler: jest.fn(),
        nextView: jest.fn().mockResolvedValue(undefined),
        showView: jest.fn().mockResolvedValue(undefined),
        done: jest.fn(),
      };
      const mockDevice = makeRepairableDevice({
        suspendRefresh: jest.fn().mockRejectedValue(new Error('suspend failed')),
      });

      driver.homey = { __: jest.fn((key: string) => key), flow: { getConditionCard: jest.fn(), getActionCard: jest.fn() } };

      await driver.onRepair(mockSession, mockDevice);

      const setConn = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'set_connection_info');
      await (setConn![1] as (d: unknown) => Promise<unknown>)({
        address: '192.168.1.30',
        username: 'admin',
        password: 'newsecret',
      });

      const showViewHandler = mockSession.setHandler.mock.calls.find((c: unknown[]) => c[0] === 'showView')![
        1
      ] as (view: string) => Promise<void>;
      await showViewHandler('loading');

      expect(mockSession.showView).toHaveBeenCalledWith('connection_error');
      expect(mockDevice.resumeRefresh).toHaveBeenCalled();
    });
  });

});
