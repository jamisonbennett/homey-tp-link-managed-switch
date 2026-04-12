'use strict';

import { jest } from '@jest/globals';

import axios from 'axios';
import DeviceAPI, { SystemInfo, PortSettings } from '../deviceAPI';
import Logger, { ILogger } from '../../../lib/Logger';

jest.mock('axios');

const mockLoginInfo = `<script>
var logonInfo = new Array(
0,
0,0);
var g_Lan = 1;
var g_year=2023;
</script>`

const mockLoginInfoUnsuccessful = `<script>
var logonInfo = new Array(
1,
0,0);
var g_Lan = 1;
var g_year=2023;
</script>`

const mockSystemInfo: SystemInfo = {
  macAddress: '00:11:22:33:44:55', 
  firmwareVersion: '1.0.0 Build 20230218 Rel.50633',
  hardwareVersion: 'TL-SG108E 6.0',
  description: 'TL-SG108E'
};

const numPorts = 8;

const mockSystemInfoData = `<!DOCTYPE html>
<script>
var info_ds = {
    descriStr: [
    "TL-SG108E"
    ],
    macStr: [
    "00:11:22:33:44:55"
    ],
    ipStr: [
    "192.168.68.2"
    ],
    netmaskStr: [
    "255.255.255.0"
    ],
    gatewayStr: [
    "192.168.68.1"
    ],
    firmwareStr: [
    "1.0.0 Build 20230218 Rel.50633"
    ],
    hardwareStr: [
    "TL-SG108E 6.0"
    ]
};
var tip = "";
</script>`

const mockPortSettingsData = `<!DOCTYPE html>
<script>
var max_port_num = 8;
var port_middle_num = 16;
var all_info = {
    state: [1, 1, 0, 0, 1, 1, 1, 0, 0, 0],
    trunk_info: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    spd_cfg: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    spd_act: [6, 6, 0, 6, 6, 0, 6, 0, 0, 0],
    fc_cfg: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    fc_act: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
};
var tip = "";
</script>`

const mockTurnOnLEDRpmData = `<!DOCTYPE html>
<script>
var led = 1
var tip = "";
</script>`

async function performSuccessfulLogin(deviceAPI: DeviceAPI) {
  // Mocking axios.post for login
  jest.spyOn(axios, 'post').mockResolvedValueOnce({
    status: 200, 
    headers: {
      'set-cookie': ['H_P_SSID=mocked_cookie; Path=/; HttpOnly'],
    },
    data: mockLoginInfo,
  }); 
    
  // Mocking axios.get for getSystemInfo
  jest.spyOn(axios, 'get').mockResolvedValueOnce({
    status: 200,
    data: mockSystemInfoData
  });
  jest.spyOn(axios, 'get').mockResolvedValueOnce({
    status: 200,
    data: mockSystemInfoData
  });

  // Mocking axios.get for getPortSettings
  jest.spyOn(axios, 'get').mockResolvedValueOnce({
    status: 200,
    data: mockPortSettingsData
  });

  const result = await deviceAPI.connect();
  expect(result).toBe(true);
}

describe('DeviceAPI', () => {
  let deviceAPI: DeviceAPI;
  const mockIpAddress = '192.168.0.1';
  const mockUsername = 'admin';
  const mockPassword = 'password';
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    };
    deviceAPI = new DeviceAPI(mockLogger, mockIpAddress, mockUsername, mockPassword);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('rejects values that would break URL construction', () => {
      expect(() => new DeviceAPI(mockLogger, '192.168.0.1/evil', mockUsername, mockPassword))
        .toThrow('Invalid switch address');
    });

    it('rejects invalid username or password for this app', () => {
      expect(() => new DeviceAPI(mockLogger, mockIpAddress, '', mockPassword))
        .toThrow('Invalid username');
      expect(() => new DeviceAPI(mockLogger, mockIpAddress, mockUsername, 'x'.repeat(257)))
        .toThrow('Invalid password');
    });
  });

  describe('connect', () => {
    it('should login and fetch system info and port settings', async () => {
      await performSuccessfulLogin(deviceAPI);
      expect(deviceAPI.getName()).toBe(mockSystemInfo.description);
      expect(deviceAPI.getMacAddress()).toBe(mockSystemInfo.macAddress);
      expect(deviceAPI.getFirmwareVersion()).toBe(mockSystemInfo.firmwareVersion);
      expect(deviceAPI.getHardwareVersion()).toBe(mockSystemInfo.hardwareVersion);
      expect(deviceAPI.getNumPorts()).toBe(numPorts);
    });

    it('should pass axios response/body size limits on every switch HTTP call', async () => {
      await performSuccessfulLogin(deviceAPI);
      const limits = {
        maxContentLength: 512 * 1024,
        maxBodyLength: 512 * 1024,
        maxRedirects: 2,
      };
      const postMock = axios.post as jest.Mock;
      const getMock = axios.get as jest.Mock;
      for (const call of postMock.mock.calls) {
        expect(call[2]).toMatchObject(limits);
      }
      for (const call of getMock.mock.calls) {
        expect(call[1]).toMatchObject(limits);
      }
    });

    it('should return false when login response Content-Type is not HTML-like', async () => {
      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': ['H_P_SSID=mocked_cookie; Path=/; HttpOnly'],
        },
        data: mockLoginInfo,
      });

      const result = await deviceAPI.connect();
      expect(result).toBe(false);
    });

    it('should return false on unsuccessful login with 200', async () => {
      // Mocking axios.post for login
      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        status: 200,
        headers: {
          'set-cookie': ['H_P_SSID=mocked_cookie; Path=/; HttpOnly'],
        },
        data: mockLoginInfoUnsuccessful,
      });

      const result = await deviceAPI.connect();
      expect(result).toBe(false);
    });

    it('should return false if login fails with 401', async () => {
      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        status: 401,
      });

      const result = await deviceAPI.connect();
      expect(result).toBe(false);
    });

    it('should return false when system info MAC in the page is not valid hex', async () => {
      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        status: 200,
        headers: {
          'set-cookie': ['H_P_SSID=mocked_cookie; Path=/; HttpOnly'],
        },
        data: mockLoginInfo,
      });
      const good = mockSystemInfoData;
      const badMac = mockSystemInfoData.replace(
        '00:11:22:33:44:55',
        'GG:HH:II:JJ:KK:LL',
      );
      jest.spyOn(axios, 'get').mockResolvedValueOnce({ status: 200, data: good });
      jest.spyOn(axios, 'get').mockResolvedValueOnce({ status: 200, data: badMac });

      const result = await deviceAPI.connect();
      expect(result).toBe(false);
    });
  });

  describe('setPortEnabled', () => {
    it('should enable or disable the port correctly', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockPortSettingsData
      });

      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
      });

      const result = await deviceAPI.setPortEnabled(1, true);
      expect(result).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        params: expect.objectContaining({
          portid: 1,
          state: 1,
        })
      }));
    });

    it('should return false if setting the port state fails', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockPortSettingsData
      });

      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 400,
      });

      const result = await deviceAPI.setPortEnabled(1, true);
      expect(result).toBe(false);
    });

  });

  describe('getAllPortsEnabled', () => {
    it('should return portEnabled array when relogin and getPortSettings succeed', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockPortSettingsData
      });

      const result = await deviceAPI.getAllPortsEnabled();
      expect(result).toEqual([true, true, false, false, true, true, true, false]);
    });

    it('should return null if getPortSettings fails', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 400
      });

      const result = await deviceAPI.getAllPortsEnabled();
      expect(result).toBeNull();
    });

  });

  describe('getPortEnabled', () => {
    it('should return the value when relogin and getPortSettings succeed', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockPortSettingsData
      });

      const result = await deviceAPI.getPortEnabled(1);
      expect(result).toEqual(true);
    });

    it('should return null if getPortSettings fails', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 400
      });
      
      const result = await deviceAPI.getPortEnabled(1);
      expect(result).toBeNull();
    });

  });

  describe('getLedsEnabled', () => {
    it('should return the value when relogin and getLedSettings succeed', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockTurnOnLEDRpmData
      });

      const result = await deviceAPI.getLedsEnabled();
      expect(result).toEqual(true);
    });

    it('should return null if getLedSettings fails', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 400
      });

      const result = await deviceAPI.getLedsEnabled();
      expect(result).toBeNull();
    });

    it('should return null when LED field is not 0 or 1', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData,
      });
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: '<script>\nvar led = 2\nvar tip = "";\n</script>',
      });

      const result = await deviceAPI.getLedsEnabled();
      expect(result).toBeNull();
    });

  });

  describe('setLedsEnabled', () => {
    it('should return true if it succeeds', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200
      });
  
      const result = await deviceAPI.setLedsEnabled(true);
      expect(result).toEqual(true);
    });
    
    it('should return false if it fails', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 400
      });
    
      const result = await deviceAPI.setLedsEnabled(true);
      expect(result).toEqual(false);
    });
  
  });

  describe('isLinkUp', () => {
    it('should return true if the link is up', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockPortSettingsData
      });
      
      const result = await deviceAPI.isLinkUp(1);
      expect(result).toEqual(true);
    });
   
    it('should return null if getPortSettings fails', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 400
      });
      
      const result = await deviceAPI.isLinkUp(1);
      expect(result).toBeNull();
    });
      
  }); 

  describe('getAllLinksUp', () => {
    it('should return all the link status', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockPortSettingsData
      });

      const result = await deviceAPI.getAllLinksUp();
      expect(result).toEqual([true, true, false, true, true, false, true, false]);
    });

    it('should return null if getPortSettings fails', async () => {
      await performSuccessfulLogin(deviceAPI); 
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 400
      });
      
      const result = await deviceAPI.getAllLinksUp();
      expect(result).toBeNull();
    });
      
  });

  describe('restart', () => {
    it('should return true if it succeeds', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        status: 200
      });
      
      const result = await deviceAPI.restart();
      expect(result).toEqual(true);
    });
    
    it('should return false if it fails', async () => {
      await performSuccessfulLogin(deviceAPI);
      jest.spyOn(axios, 'get').mockResolvedValueOnce({
        status: 200,
        data: mockSystemInfoData
      });;
      jest.spyOn(axios, 'post').mockResolvedValueOnce({
        status: 400
      });
      
      const result = await deviceAPI.restart();
      expect(result).toEqual(false);
    });
      
  }); 
});
