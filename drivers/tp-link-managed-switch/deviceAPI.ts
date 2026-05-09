'use strict';

import axios, { isAxiosError, type GenericAbortSignal, type RawAxiosResponseHeaders } from 'axios';
import Logger, { type ILogger } from '../../lib/Logger';
import assertValidSwitchHostAddress from '../../lib/switchHostAddress';
import { assertValidSwitchPassword, assertValidSwitchUsername } from '../../lib/switchCredentials';
import {
  assertLedStateFromDevice,
  assertLogonResponseCode,
  assertPortCountFromDevice,
  assertValidDescriptionString,
  assertValidFirmwareVersionString,
  assertValidHardwareVersionString,
  assertValidSessionCookieHeaderPair,
  mapSpeedActToLinkUp,
  mapZeroOneToBooleans,
  normalizeMacFromDeviceHtml,
  parsePortTableIntegers,
} from '../../lib/switchDeviceWebData';

/** TCP/connect/response limit so half-open or stuck LAN sessions fail fast instead of hanging. */
const HTTP_TIMEOUT_MS = 2_000;

/**
 * Caps how much data axios will accept per request/response. TP-Link admin pages are small HTML/JS;
 * this limits memory use if the configured host is not the switch or returns a pathological payload.
 */
const AXIOS_MAX_CONTENT_BYTES = 512 * 1024;

const axiosSwitchLimits = {
  maxContentLength: AXIOS_MAX_CONTENT_BYTES,
  maxBodyLength: AXIOS_MAX_CONTENT_BYTES,
  /** Low cap: enough for typical device/trailing-slash redirects, limits long cross-host chains. */
  maxRedirects: 2,
};

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

/** Outcome of `tryConnect` so pair/repair UIs can show the same message that is logged. */
export type ConnectResult = { ok: true } | { ok: false; message: string };

class DeviceAPI extends Logger {

  private ipAddress: string;
  private username: string;
  private password: string;
  private systemInfo: SystemInfo | null = null;
  private numPorts: number = 0;

  private cookie: string = '';
  private cookielessModeEnabled: boolean = false;
  private readonly abortSignal?: GenericAbortSignal;

  constructor(logger: ILogger, ipAddress: string, username: string, password: string, abortSignal?: GenericAbortSignal) {
    super(logger);
    this.ipAddress = assertValidSwitchHostAddress(ipAddress);
    this.username = assertValidSwitchUsername(username);
    this.password = assertValidSwitchPassword(password);
    this.abortSignal = abortSignal;
  }

  private axiosAbortConfig(): { signal: GenericAbortSignal } | Record<string, never> {
    return this.abortSignal ? { signal: this.abortSignal } : {};
  }

  private isAbortedRequest(error: unknown): boolean {
    return isAxiosError(error) && error.code === 'ERR_CANCELED';
  }

  /**
   * Older Easy Smart firmware revisions can expose data pages without issuing H_P_SSID.
   * Keep this as an explicit compatibility mode that is only enabled after successful login parsing.
   */
  private canUseCookielessMode(): boolean {
    return this.cookielessModeEnabled;
  }

  private authHeaders(): { Cookie: string } | Record<string, never> {
    const cookie = this.getCookie();
    if (cookie === '') {
      return {};
    }
    return { Cookie: cookie };
  }

  /**
   * If Content-Type is present it must look like TP-Link admin markup. Missing/empty is allowed
   * (many embedded devices omit it).
   */
  private assertReasonableSwitchContentType(headers: RawAxiosResponseHeaders | undefined): void {
    if (headers == null) {
      return;
    }
    const raw = headers['content-type'];
    let ct = '';
    if (typeof raw === 'string') {
      ct = raw;
    } else if (Array.isArray(raw)) {
      ct = String(raw[0] ?? '');
    }
    if (ct.trim() === '') {
      return;
    }
    const main = ct.split(';')[0].trim().toLowerCase();
    if (main === 'text/html' || main === 'text/plain' || main === 'application/xhtml+xml') {
      return;
    }
    throw new Error('Unexpected content type from device');
  }

  public getName(): string {
    return this.systemInfo ? this.systemInfo.description : '';
  }

  public getMacAddress(): string {
    return this.systemInfo ? this.systemInfo.macAddress : '';
  }

  public getFirmwareVersion(): string {
    return this.systemInfo ? this.systemInfo.firmwareVersion : '';
  }

  public getHardwareVersion(): string {
    return this.systemInfo ? this.systemInfo.hardwareVersion : '';
  }

  public async isLoggedIn(): Promise<boolean> {
    const cookie = this.getCookie();
    if ((cookie == null || cookie === '') && !this.canUseCookielessMode()) {
      return false;
    }

    try {
      const response = await axios.get(`http://${this.ipAddress}/SystemInfoRpm.htm`, {
        ...axiosSwitchLimits,
        ...this.axiosAbortConfig(),
        timeout: HTTP_TIMEOUT_MS,
        headers: this.authHeaders(),
      });

      if (response.status !== 200) {
        return false;
      }

      this.assertReasonableSwitchContentType(response.headers);

      const data = await response.data;

      const macAddressMatch = data.match(/macStr:\s?\[\n?\s*"([^"]+)"\n?\s*\]/);

      if (!macAddressMatch || !macAddressMatch[1]) {
        return false;
      }

      try {
        normalizeMacFromDeviceHtml(macAddressMatch[1]);
      } catch {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private async reloginIfNeeded(): Promise<boolean> {
    // Check whether the session is still valid, and log in only when needed.
    // Cookies can expire or the session can be invalidated.
    // The device invalidates the existing session when anyone logs in.
    if (await this.isLoggedIn()) {
      return true;
    }
    const isLoggedIn = await this.login();
    return isLoggedIn;
  }

  public async connect(): Promise<boolean> {
    const outcome = await this.tryConnect();
    return outcome.ok;
  }

  /**
   * Logs in and loads device identity and port layout. Returns structured failure so pairing/repair UIs
   * can surface the same diagnostic text that is written to the driver log.
   */
  public async tryConnect(): Promise<ConnectResult> {
    const loginOutcome = await this.tryLogin();
    if (!loginOutcome.ok) {
      return loginOutcome;
    }
    try {
      const systemInfo = await this.readSystemInfo();
      const portSettings = await this.readPortSettings();
      this.systemInfo = systemInfo;
      this.numPorts = portSettings.numPorts;
      return { ok: true };
    } catch (error) {
      if (this.isAbortedRequest(error)) {
        return { ok: false, message: this.formatErrorForUser(error) };
      }
      const message = this.formatErrorForUser(error);
      this.log(`Error loading device after login: ${message}`);
      return { ok: false, message };
    }
  }

  private async login(): Promise<boolean> {
    const outcome = await this.tryLogin();
    return outcome.ok;
  }

  /**
   * Performs HTTP login and session verification; returns a stable failure message for UI and logs.
   */
  private async tryLogin(): Promise<ConnectResult> {
    // The login process is destructive and if there is an existing session it is invalidated.
    this.log(`logging in to ${this.ipAddress}`);
    try {
      const response = await axios.post(`http://${this.ipAddress}/logon.cgi`, null, {
        ...axiosSwitchLimits,
        ...this.axiosAbortConfig(),
        timeout: HTTP_TIMEOUT_MS,
        validateStatus: (status) => status >= 200 && status < 500,
        params: {
          username: this.username,
          password: this.password,
          cpassword: '',
          logon: 'Login',
        },
      });

      if (response.status !== 200 && response.status !== 401) {
        throw new Error(`HTTP status ${response.status}`);
      }

      this.assertReasonableSwitchContentType(response.headers);

      const html = typeof response.data === 'string' ? response.data : String(response.data ?? '');
      const loginResponseCode = this.processLoginResponse(html);
      if (loginResponseCode !== 0) {
        const loginFailureReason = this.loginErrorCodeToMessage(loginResponseCode);
        throw new Error(`Login failed with reason ${loginFailureReason}`);
      }

      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        const setCookieHeaders = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        this.saveSessionCookie(setCookieHeaders);
        this.cookielessModeEnabled = false;
        const sessionOk = await this.isLoggedIn();
        if (!sessionOk) {
          throw new Error(
            'Login succeeded but the session could not be verified. Check the IP or hostname and that this is a compatible TP-Link Easy Smart switch.',
          );
        }
        return { ok: true };
      }

      this.cookielessModeEnabled = true;
      if (await this.isLoggedIn()) {
        return { ok: true };
      }
      this.cookielessModeEnabled = false;
      throw new Error('Session cookie missing and cookieless mode probe failed.');
    } catch (error) {
      const message = this.formatErrorForUser(error);
      this.log(`Error connecting to the device: ${message}`);
      return { ok: false, message };
    }
  }

  /**
   * Normalizes axios and generic errors into a single human-readable line for logs and pair/repair UI.
   */
  private formatErrorForUser(error: unknown): string {
    if (this.isAbortedRequest(error)) {
      return 'Request was cancelled.';
    }
    if (isAxiosError(error)) {
      const code = error.code ? String(error.code) : '';
      const status = error.response?.status;
      const hint = [code && code !== 'ERR_BAD_RESPONSE' ? code : '', status ? `HTTP ${status}` : '']
        .filter(Boolean)
        .join(' · ');
      const detail = error.message || 'Network request failed';
      return hint ? `${hint} — ${detail}` : detail;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'An unknown error occurred.';
  }

  private processLoginResponse(data: string): number {
    const loginInfoMatch = data.match(/var\s+logonInfo\s*=\s*new\s+Array\s*\(\s*(-?\d+)/);
    if (!loginInfoMatch || !loginInfoMatch[1]) {
      throw new Error('Login info not found in the response.');
    }

    const code = parseInt(loginInfoMatch[1], 10);
    return assertLogonResponseCode(code);
  }

  private loginErrorCodeToMessage(loginErrorCode: number): string {
    switch (loginErrorCode) {
      case 0:
        return 'Login was successful';
      case 1:
        return 'Invalid username or password.';
      case 2:
        return 'The user is not allowed to log in.';
      case 3:
      case 4:
        return 'Too many users are logged in.';
      case 5:
        return 'The session has timed out.';
      case 6:
        return 'The user must log in to the switch and change the password.';
      default:
        return `There was an unknown login response type (error_type=${loginErrorCode})`;
    }
  }

  private saveSessionCookie(setCookieHeaders: string[]) {
    // Extract the cookie for the session
    const cookie = setCookieHeaders.find((c) => c.startsWith('H_P_SSID='));
    if (cookie) {
      this.cookie = assertValidSessionCookieHeaderPair(cookie);
    } else {
      throw new Error('H_P_SSID cookie not found in the response headers.');
    }
  }

  /**
   * Loads system info HTML and parses fields; throws so `tryConnect` can forward the message.
   */
  private async readSystemInfo(): Promise<SystemInfo> {
    const response = await axios.get(`http://${this.ipAddress}/SystemInfoRpm.htm`, {
      ...axiosSwitchLimits,
      ...this.axiosAbortConfig(),
      timeout: HTTP_TIMEOUT_MS,
      headers: this.authHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`HTTP status ${response.status}`);
    }

    this.assertReasonableSwitchContentType(response.headers);

    const data = await response.data;

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

    return {
      macAddress: normalizeMacFromDeviceHtml(macAddressMatch[1]),
      firmwareVersion: assertValidFirmwareVersionString(firmwareMatch[1]),
      hardwareVersion: assertValidHardwareVersionString(hardwareMatch[1]),
      description: assertValidDescriptionString(descriptionMatch[1]),
    };
  }

  private async getSystemInfo(): Promise<SystemInfo | null> {
    // Gets the information from the device's system info page.
    // This requires an active login session.
    try {
      return await this.readSystemInfo();
    } catch (error) {
      if (this.isAbortedRequest(error)) {
        return null;
      }
      this.log(`Error fetching device info: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return null;
    }
  }

  /**
   * Loads port settings HTML and parses tables; throws so `tryConnect` can forward the message.
   */
  private async readPortSettings(): Promise<PortSettings> {
    const response = await axios.get(`http://${this.ipAddress}/PortSettingRpm.htm`, {
      ...axiosSwitchLimits,
      ...this.axiosAbortConfig(),
      timeout: HTTP_TIMEOUT_MS,
      headers: this.authHeaders(),
    });

    if (response.status !== 200) {
      throw new Error(`HTTP status ${response.status}`);
    }

    this.assertReasonableSwitchContentType(response.headers);

    const data = await response.data;

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

    const numPorts = assertPortCountFromDevice(parseInt(maxPortMatch[1], 10));
    const stateNums = parsePortTableIntegers(stateMatch[1], numPorts, 'port state');
    const flowNums = parsePortTableIntegers(flowControlMatch[1], numPorts, 'flow control');
    const speedNums = parsePortTableIntegers(speedMatch[1], numPorts, 'port speed config');
    const actNums = parsePortTableIntegers(linkUpMatch[1], numPorts, 'port link speed');

    return {
      numPorts,
      portEnabled: mapZeroOneToBooleans(stateNums, 'port state'),
      flowControl: mapZeroOneToBooleans(flowNums, 'flow control'),
      speed: speedNums,
      linkUp: mapSpeedActToLinkUp(actNums),
    };
  }

  private async getPortSettings(): Promise<PortSettings | null> {
    // Gets the device's port settings
    try {
      return await this.readPortSettings();
    } catch (error) {
      if (this.isAbortedRequest(error)) {
        return null;
      }
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
    // Enables or disables a switch port.
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
      const response = await axios.get(`http://${this.ipAddress}/port_setting.cgi`, {
        ...axiosSwitchLimits,
        ...this.axiosAbortConfig(),
        timeout: HTTP_TIMEOUT_MS,
        headers: this.authHeaders(),
        params: {
          portid: port,
          state,
          speed: portSettings.speed[port - 1],
          flowcontrol: portSettings.flowControl[port - 1] ? 1 : 0,
          apply: 'Apply',
        },
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      this.assertReasonableSwitchContentType(response.headers);

      return true;
    } catch (error) {
      if (this.isAbortedRequest(error)) {
        return false;
      }
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
    // Gets the device's LED settings from the admin page.
    try {
      const response = await axios.get(`http://${this.ipAddress}/TurnOnLEDRpm.htm`, {
        ...axiosSwitchLimits,
        ...this.axiosAbortConfig(),
        timeout: HTTP_TIMEOUT_MS,
        headers: this.authHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      this.assertReasonableSwitchContentType(response.headers);

      const data = await response.data;

      // Extract the LED state from the response
      const ledMatch = data.match(/var\s+led\s*=\s*(\d+)\s*/);

      if (!ledMatch || !ledMatch[1]) {
        throw new Error('LED status not found in the response.');
      }

      const ledVal = parseInt(ledMatch[1], 10);
      return assertLedStateFromDevice(ledVal);
    } catch (error) {
      if (this.isAbortedRequest(error)) {
        return null;
      }
      this.log(`Error fetching LED settings: ${error instanceof Error ? error.message : 'an unknown error occurred.'}`);
      return null;
    }
  }

  public async setLedsEnabled(enabled: boolean): Promise<boolean> {
    // Enables or disables the LEDs
    // This logs in if needed.
    const loggedIn = await this.reloginIfNeeded();
    if (!loggedIn) {
      return false;
    }

    const state = enabled ? 1 : 0;

    try {
      // NOTE: The device uses HTTP GET for changing the configuration.
      const response = await axios.get(`http://${this.ipAddress}/led_on_set.cgi`, {
        ...axiosSwitchLimits,
        ...this.axiosAbortConfig(),
        timeout: HTTP_TIMEOUT_MS,
        headers: this.authHeaders(),
        params: {
          rd_led: state,
          led_cfg: 'Apply',
        },
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      this.assertReasonableSwitchContentType(response.headers);

      return true;
    } catch (error) {
      if (this.isAbortedRequest(error)) {
        return false;
      }
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
      const response = await axios.post(`http://${this.ipAddress}/reboot.cgi`, null, {
        ...axiosSwitchLimits,
        ...this.axiosAbortConfig(),
        timeout: HTTP_TIMEOUT_MS,
        headers: this.authHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }

      this.assertReasonableSwitchContentType(response.headers);

      return true;
    } catch (error) {
      if (this.isAbortedRequest(error)) {
        return false;
      }
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
    const { cookie } = this;
    return cookie;
  }

}

export default DeviceAPI;
