import Homey from 'homey';
import axios from 'axios';

export interface SystemInfo {
  macAddress: string;
  firmwareVersion: string;
  hardwareVersion: string;
  description: string;
}

export interface PortSettings {
  numPorts: number;
  portEnabled: boolean[];
}

class DeviceAPI {

  private ipAddress: string;
  private username: string;
  private password: string;
  private systemInfo: SystemInfo | null = null;
  private numPorts: number = 0;

  private cookie: string = "";

  constructor(ipAddress: string, username: string, password: string) {
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

  private async reloginIfNeeded(): Promise<boolean> {
    // Check to see if the current login works and only login if needed.
    // Cookies can expire or the session can be invalidated.
    // The device invalidates the existing session when anyone logs in.
    let systemInfo = await this.getSystemInfo();
    if (!systemInfo) {
      const isLoggedIn = await this.login();
      if (!isLoggedIn) {
        return false;
      }
      systemInfo = await this.getSystemInfo();
    }
    return systemInfo != null;
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

      const setCookieHeader = response.headers['set-cookie'];
      if (!setCookieHeader) {
        throw new Error('set-cookie header not found.');
      }

      this.saveSessionCookie(setCookieHeader);

      this.systemInfo = await this.getSystemInfo();
      return this.systemInfo != null;
    } catch (error) {
      this.log(`Error connecting to the device: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return false;
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
    if (!this.cookie) {
      this.log('Error: No valid session cookie found. Please connect first.');
      return null;
    }

    try {
      const response = await axios.get(`http://${this.ipAddress}/SystemInfoRpm.htm`, {
        headers: {
          'Cookie': this.cookie
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const data = await response.data;

      // Extract the device info from the response
      const macAddressMatch = data.match(/macStr:\[\n?"([^"]+)"\n?\]/);
      const firmwareMatch = data.match(/firmwareStr:\[\n?"([^"]+)"\n?\]/);
      const hardwareMatch = data.match(/hardwareStr:\[\n?"([^"]+)"\n?\]/);
      const descriptionMatch = data.match(/descriStr:\[\n?"([^"]+)"\n?\]/);

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
    if (!this.cookie) {
      this.log('Error: No valid session cookie found. Please connect first.');
      return null;
    }

    try {
      const response = await axios.get(`http://${this.ipAddress}/PortSettingRpm.htm`, {
        headers: {
          'Cookie': this.cookie
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const data = await response.data;

      // Extract the port setting from the response
      const maxPortMatch = data.match(/var\s+max_port_num\s*=\s*(\d+);/);
      const stateMatch = data.match(/state:\s*\[([^\]]+)\]/);

      if (!maxPortMatch || !maxPortMatch[1]) {
        throw new Error('Max port number not found in the response.');
      }

      if (!stateMatch || !stateMatch[1]) {
        throw new Error('Port state not found in the response.');
      }

      const numPorts = parseInt(maxPortMatch[1]);
      const stateArray = stateMatch[1].split(',')
        .map((num: string) => parseInt(num.trim()))
        .slice(0, numPorts)
        .map((state: number) => state == 1);

      const portSettings: PortSettings = {
        numPorts: parseInt(maxPortMatch[1]),
        portEnabled: stateArray
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
      // NOTE: The device uses HTTP GET for changing the configuration.
      const response = await axios.get(`http://${this.ipAddress}/port_setting.cgi`, {
        headers: {
          'Cookie': this.cookie
        },
        params: {
          portid: port,
          state: state,
          speed: 1,
          flowcontrol: 0,
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

  private log(message: string) {
    console.log(message); // TODO
  }
}

export default DeviceAPI;