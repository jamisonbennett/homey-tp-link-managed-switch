'use strict';

import Homey from 'homey';
import axios from 'axios';
import Logger from '../../lib/Logger';

export interface SystemInfo {
  macAddress: string;
  firmwareVersion: string;
  hardwareVersion: string;
  description: string;
}

export interface PortSettings {
  numPorts: number;
  portEnabled: boolean[];
  flowControl: boolean[];
  speed: number[];
  linkUp: boolean[];
}

class DeviceAPI extends Logger {

  private ipAddress: string;
  private username: string;
  private password: string;
  private systemInfo: SystemInfo | null = null;
  private numPorts: number = 0;

  private cookie: string = "";

  constructor(logger: any, ipAddress: string, username: string, password: string) {
    super(logger);
    this.ipAddress = ipAddress;
    this.username = username;
    this.password = password;
  }

  public getName(): string {
    return this.systemInfo ? this.systemInfo.description : "";
  }

  public getMacAddress(): string {
    return this.systemInfo ? this.systemInfo.macAddress : "";
  }

  public getFirmwareVersion(): string {
    return this.systemInfo ? this.systemInfo.firmwareVersion : "";
  }

  public getHardwareVersion(): string {
    return this.systemInfo ? this.systemInfo.hardwareVersion : "";
  }

  public async isLoggedIn(): Promise<boolean> {
    const cookie = this.getCookie();
    if (!cookie || cookie == "") {
      return false;
    }

    try {
      const response = await axios.get(`http://${this.ipAddress}/SystemInfoRpm.htm`, {
        headers: {
          'Cookie': cookie
        }
      });

      if (response.status !== 200) {
        return false;
      }

      const data = await response.data;

      const macAddressMatch = data.match(/macStr:\s?\[\n?\s*"([^"]+)"\n?\s*\]/);

      if (!macAddressMatch || !macAddressMatch[1]) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private async reloginIfNeeded(): Promise<boolean> {
    // Check to see if the current login works and only login if needed.
    // Cookies can expire or the session can be invalidated.
    // The device invalidates the existing session when anyone logs in.
    if (await this.isLoggedIn()) {
      return true;
    }
    const isLoggedIn = await this.login();
    return isLoggedIn;
  }

  public async connect(): Promise<boolean> {
    // Login and load the device information
    const isLoggedIn = await this.login();
    if (!isLoggedIn) {
      return false;
    }
    const systemInfo = await this.getSystemInfo();
    const portSettings = await this.getPortSettings();
    if (systemInfo == null || portSettings == null) {
      return false;
    }
    this.systemInfo = systemInfo;
    this.numPorts = portSettings.numPorts;
    return true;
  }

  private async login(): Promise<boolean> {
    // The login process is destructive and if there is an existing session it is invalidated.
    this.log(`logging in to ${this.ipAddress}`);
    try {
      // Post to the login page and get the cookie
      const response = await axios.post(`http://${this.ipAddress}/logon.cgi`, null, {
        params: {
          username: this.username,
          password: this.password,
          cpassword: '',
          logon: 'Login'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const html = typeof response.data === 'string' ? response.data : String(response.data ?? '');
      const loginResponseCode = this.processLoginResponse(html);
      if (loginResponseCode !== 0) {
        const loginFailureReason = this.loginErrorCodeToMessage(loginResponseCode);
        throw new Error(`Login failed with reason ${loginFailureReason}`);
      }

      const setCookieHeader = response.headers['set-cookie'];
      if (!setCookieHeader) {
        throw new Error('set-cookie header not found.');
      }

      const setCookieHeaders = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      this.saveSessionCookie(setCookieHeaders);

      return this.isLoggedIn();
    } catch (error) {
      this.log(`Error connecting to the device: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return false;
    }
  }

  private processLoginResponse(data: string): number {
    const loginInfoMatch = data.match(/var\s+logonInfo\s*=\s*new\s+Array\s*\(\s*(-?\d+)/)
    if (!loginInfoMatch || !loginInfoMatch[1]) {
      throw new Error('Login info not found in the response.');
    }

    return parseInt(loginInfoMatch[1]);
  }

  private loginErrorCodeToMessage(loginErrorCode: number): string {
    switch (loginErrorCode) {
      case 0:
        return "Login was successful";
      case 1:
        return "Invalid username or password.";
      case 2:
        return "The user is not allowed to login.";
      case 3:
      case 4:
        return "Too many users are logged in.";
      case 5:
        return "The session has timed out.";
      case 6:
        return "The user must login to the switch and change the password.";
      default:
        return `There was an unknown login response type (error_type=${loginErrorCode})`;
    }
  }

  private saveSessionCookie(setCookieHeaders: string[]) {
    // Extract the cookie for the session
    const cookie = setCookieHeaders.find(cookie => cookie.startsWith('H_P_SSID='));
    if (cookie) {
      this.cookie = cookie.split(';')[0];
    } else {
      throw new Error('H_P_SSID cookie not found in the response headers.');
    }
  }

  private async getSystemInfo(): Promise<SystemInfo | null> {
    // Gets the information from the device's system info page.
    // This requires an active login session.
    const cookie = this.getCookie();

    try {
      const response = await axios.get(`http://${this.ipAddress}/SystemInfoRpm.htm`, {
        headers: {
          'Cookie': cookie
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const data = await response.data;

      // Extract the device info from the response
      const macAddressMatch = data.match(/macStr:\s?\[\n?\s*"([^"]+)"\n?\s*\]/);
      const firmwareMatch = data.match(/firmwareStr:\s?\[\n?\s*"([^"]+)"\n?\s*\]/);
      const hardwareMatch = data.match(/hardwareStr:\s?\[\n?\s*"([^"]+)"\n?\s*\]/);
      const descriptionMatch = data.match(/descriStr:\s?\[\n?\s*"([^"]+)"\n?\s*\]/);

      if (!macAddressMatch || !macAddressMatch[1]) {
        throw new Error('MAC address not found in the response.');
      }

      if (!firmwareMatch || !firmwareMatch[1]) {
        throw new Error('Firmware version not found in the response.');
      }

      if (!hardwareMatch || !hardwareMatch[1]) {
        throw new Error('Hardware version not found in the response.');
      }

      if (!descriptionMatch || !descriptionMatch[1]) {
        throw new Error('Description not found in the response.');
      }

      const systemInfo: SystemInfo = {
        macAddress: macAddressMatch[1].toLowerCase(),
        firmwareVersion: firmwareMatch[1],
        hardwareVersion: hardwareMatch[1],
        description: descriptionMatch[1]
      };
      return systemInfo;
    } catch (error) {
      this.log(`Error fetching device info: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return null;
    }
  }

  private async getPortSettings(): Promise<PortSettings | null> {
    // Gets the device's port settings
    const cookie = this.getCookie();

    try {
      const response = await axios.get(`http://${this.ipAddress}/PortSettingRpm.htm`, {
        headers: {
          'Cookie': cookie
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const data = await response.data;

      // Extract the port setting from the response
      const maxPortMatch = data.match(/var\s+max_port_num\s*=\s*(\d+);/);
      const stateMatch = data.match(/state:\s*\[([^\]]+)\]/);
      const flowControlMatch = data.match(/fc_cfg:\s*\[([^\]]+)\]/);
      const speedMatch = data.match(/spd_cfg:\s*\[([^\]]+)\]/);
      const linkUpMatch = data.match(/spd_act:\s*\[([^\]]+)\]/);

      if (!maxPortMatch || !maxPortMatch[1]) {
        throw new Error('Max port number not found in the response.');
      }

      if (!stateMatch || !stateMatch[1]) {
        throw new Error('Port state not found in the response.');
      }

      if (!flowControlMatch || !flowControlMatch[1]) {
        throw new Error('Port flow control not found in the response.');
      }

      if (!speedMatch || !speedMatch[1]) {
        throw new Error('Port speed not found in the response.');
      }

      if (!linkUpMatch || !linkUpMatch[1]) {
        throw new Error('Actual port speed not found in the response.');
      }

      const numPorts = parseInt(maxPortMatch[1]);
      const stateArray = stateMatch[1].split(',')
        .map((num: string) => parseInt(num.trim()))
        .slice(0, numPorts)
        .map((state: number) => state == 1);
      const flowControlArray = flowControlMatch[1].split(',')
        .map((num: string) => parseInt(num.trim()))
        .slice(0, numPorts)
        .map((state: number) => state == 1);
      const speedArray = speedMatch[1].split(',')
        .map((num: string) => parseInt(num.trim()))
        .slice(0, numPorts);
      const linkUpArray = linkUpMatch[1].split(',')
        .map((num: string) => parseInt(num.trim()))
        .slice(0, numPorts)
        .map((state: number) => state != 0);

      const portSettings: PortSettings = {
        numPorts: parseInt(maxPortMatch[1]),
        portEnabled: stateArray,
        flowControl: flowControlArray,
        speed: speedArray,
        linkUp: linkUpArray
      };
      return portSettings;
    } catch (error) {
      this.log(`Error fetching port settings: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return null;
    }
  }

  public getNumPorts(): number {
    return this.numPorts;
  }

  public async getAllPortsEnabled(): Promise<boolean[] | null> {
    // Query the device for the current port enabled status. 
    // This logs in if needed.
    const loggedIn = await this.reloginIfNeeded();
    if (!loggedIn) {
      return null;
    }
    const portSettings = await this.getPortSettings();
    if (!portSettings) {
      return null;
    }
    return portSettings.portEnabled;
  }

  public async getPortEnabled(port: number): Promise<boolean | null> {
    // Query the device for the current port enabled status.
    // This logs in if needed.
    if (!this.isValidPort(port)) {
      return null;
    }
    const loggedIn = await this.reloginIfNeeded();
    if (!loggedIn) {
      return null;
    }
    const portSettings = await this.getPortSettings();
    if (!portSettings) {
      return null;
    }
    return portSettings.portEnabled[port - 1];
  }

  public async setPortEnabled(port: number, enabled: boolean): Promise<boolean> {
    // Enabled or disables a switch port.
    // This logs in if needed.
    if (!this.isValidPort(port)) {
      return false;
    }
    const loggedIn = await this.reloginIfNeeded();
    if (!loggedIn) {
      return false;
    }

    const state = enabled ? 1 : 0;

    try {
      const portSettings = await this.getPortSettings();
      if (portSettings == null) {
        return false;
      }

      // NOTE: The device uses HTTP GET for changing the configuration.
      const cookie = this.getCookie();
      const response = await axios.get(`http://${this.ipAddress}/port_setting.cgi`, {
        headers: {
          'Cookie': cookie
        },
        params: {
          portid: port,
          state: state,
          speed: portSettings.speed[port-1],
          flowcontrol: portSettings.flowControl[port-1] ? 1 : 0,
          apply: "Apply"
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      return true;
    } catch (error) {
      this.log(`Error setting port ${port} state: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return false;
    }
  }

  private isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= this.numPorts;
  }

  public async getLedsEnabled(): Promise<boolean | null> {
    // Query the device for the current LED enabled status.
    // This logs in if needed.
    const loggedIn = await this.reloginIfNeeded();
    if (!loggedIn) {
      return null;
    }

    return this.getLedSettings();
  }

  private async getLedSettings(): Promise<boolean | null> {
    // Gets the device's port settings
    const cookie = this.getCookie();

    try {
      const response = await axios.get(`http://${this.ipAddress}/TurnOnLEDRpm.htm`, {
        headers: {
          'Cookie': cookie
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const data = await response.data;

      // Extract the port setting from the response
      const ledMatch = data.match(/var\s+led\s*=\s*(\d+)\s*/);

      if (!ledMatch || !ledMatch[1]) {
        throw new Error('LED status not found in the response.');
      }

      return parseInt(ledMatch[1]) == 1;
    } catch (error) {
      this.log(`Error fetching LED settings: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return null;
    }
  }

  public async setLedsEnabled(enabled: boolean): Promise<boolean> {
    // Enabled or disables the LEDs
    // This logs in if needed.
    const loggedIn = await this.reloginIfNeeded();
    if (!loggedIn) { 
      return false;
    } 
        
    const state = enabled ? 1 : 0;
    
    try {
      // NOTE: The device uses HTTP GET for changing the configuration.
      const cookie = this.getCookie();
      const response = await axios.get(`http://${this.ipAddress}/led_on_set.cgi`, {
        headers: {
          'Cookie': cookie
        },
        params: {
          rd_led: state,
          led_cfg: "Apply"
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      return true;
    } catch (error) {
      this.log(`Error setting LED state: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return false;
    }
  }

  public async restart(): Promise<boolean> {
    // Restart the switch
    // This logs in if needed.
    const loggedIn = await this.reloginIfNeeded();
    if (!loggedIn) {
      return false;
    }
  
    try {
      const cookie = this.getCookie();
      const response = await axios.post(`http://${this.ipAddress}/reboot.cgi`, null, {
        headers: {
          'Cookie': cookie
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      return true;
    } catch (error) {
      this.log(`Error restarting the switch: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return false;
    } 
  }

  public async isLinkUp(port: number): Promise<boolean | null> {
    // Query the device for the current link status
    // This logs in if needed.
    if (!this.isValidPort(port)) {
      return null;
    } 
    const loggedIn = await this.reloginIfNeeded();
    if (!loggedIn) {
      return null;
    } 
    const portSettings = await this.getPortSettings();
    if (!portSettings) { 
      return null;
    } 
    return portSettings.linkUp[port - 1];
  }

  public async getAllLinksUp(): Promise<boolean[] | null> {
    // Query the device for the current link up status.
    // This logs in if needed.
    const loggedIn = await this.reloginIfNeeded();
    if (!loggedIn) {
      return null;
    }
    const portSettings = await this.getPortSettings();
    if (!portSettings) {
      return null;
    }
    return portSettings.linkUp;
  }

  private getCookie(): string {
    const cookie = this.cookie;
    return cookie;
  }

}

export default DeviceAPI;
