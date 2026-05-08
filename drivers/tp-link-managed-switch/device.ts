'use strict';

import Homey from 'homey';
import { MAX_SWITCH_PORT_COUNT } from '../../lib/switchDeviceWebData';
import DeviceAPI from './deviceAPI';

class Device extends Homey.Device {

  private linkStateChanged: Homey.FlowCardTriggerDevice | null = null;
  private alarmPortDisconnectedTrue: Homey.FlowCardTriggerDevice | null = null;
  private alarmPortDisconnectedFalse: Homey.FlowCardTriggerDevice | null = null;
  private suspendRefreshTime = 300000; // Suspend refreshing for 5 minutes to prepare for a repair
  private refreshPromise: Promise<void> | null = null;
  /** When set, a full refresh is in progress; concurrent callers await the same promise. */
  private fullRefreshInFlight: Promise<void> | null = null;
  private lastSuspendRefreshTime = 0;
  private needsFullRefresh = false;
  private registeredCapabilities = new Set<string>();
  private address: string = ''
  private username: string = ''
  private password: string = ''
  private deviceAPI: DeviceAPI | null = null
  private readonly httpAbort = new AbortController();
  private refreshInterval: NodeJS.Timeout | null = null
  private refreshIntervalProcessing: boolean = false
  private refreshTimeInterval = 60000; // 1 minute
  private refreshAndLoginTimeInterval = 3600000; // 1 Hour, this will cause other users to be logged out of the managed switch so don't make it too frequent
  private lastRefreshLoginTime = 0;
  private lastAllLinksStatus: boolean[] | null = null;

  private configurablePorts: boolean[] | null = null;

  private async refreshTick(): Promise<void> {
    if (this.getRefreshIntervalProcessing()) {
      return;
    }
    if (Date.now() - this.suspendRefreshTime < this.lastSuspendRefreshTime) {
      return;
    }
    try {
      this.setRefreshIntervalProcessing(true);
      if (this.needsFullRefresh) {
        await this.fullRefresh().catch(async (error) => {
          const errMessage = error instanceof Error ? error.message : String(error);
          this.log('Error performing full refresh: ', errMessage);
          await this.setUnavailable(errMessage);
        });
      } else {
        const isLoggedIn = this.deviceAPI != null && (await this.deviceAPI.isLoggedIn());
        const forceRefresh = Date.now() - this.lastRefreshLoginTime >= this.refreshAndLoginTimeInterval;
        if (forceRefresh) {
          this.lastRefreshLoginTime = Date.now();
        }
        if (isLoggedIn || forceRefresh) {
          await this.refreshState().catch((error) => {
            this.log('Error refreshing state: ', error);
          });
        }
      }
    } finally {
      this.setRefreshIntervalProcessing(false);
    }
  }

  async onInit() {
    this.log('TP-Link managed switch device has been initialized');

    this.registerCapabilityListener('onoff.favorite', this.onCapabilityOnoffFavorite.bind(this));
    this.registerCapabilityListener('onoff.leds', this.onCapabilityOnoffLeds.bind(this));

    this.linkStateChanged = this.homey.flow.getDeviceTriggerCard('link_state_changed');
    this.alarmPortDisconnectedTrue = this.homey.flow.getDeviceTriggerCard('alarm_port_disconnected_true');
    this.alarmPortDisconnectedFalse = this.homey.flow.getDeviceTriggerCard('alarm_port_disconnected_false');

    return this.fullRefresh().catch(async (error) => {
      const errMessage = error instanceof Error ? error.message : String(error);
      this.log('Error performing init: ', errMessage);
      try {
        await this.setUnavailable(errMessage);
      } catch (e) {
        // Device likely no longer exists — this is NOT an error
        this.log('setUnavailable failed (device may be removed):', e);
      }
    }).finally(() => {
      this.refreshInterval = this.homey.setInterval(() => {
        this.refreshTick().catch((error) => {
          this.log('Error during refresh tick: ', error);
        });
      }, this.refreshTimeInterval);
    });
  }

  async fullRefresh(): Promise<void> {
    if (this.fullRefreshInFlight != null) {
      return this.fullRefreshInFlight;
    }

    this.needsFullRefresh = true;

    const run = this.performFullRefresh();
    this.fullRefreshInFlight = run;
    this.refreshPromise = run;

    run
      .finally(() => {
        this.fullRefreshInFlight = null;
      })
      .catch(() => {
        /* rejection is already observed via returned `run` */
      });

    return run;
  }

  private async performFullRefresh(): Promise<void> {
    this.address = this.getStoreValue('address');
    this.username = this.getStoreValue('username');
    this.password = this.getStoreValue('password');
    this.deviceAPI = new DeviceAPI(this, this.address, this.username, this.password, this.httpAbort.signal);
    this.lastRefreshLoginTime = Date.now();
    if (!await this.deviceAPI.connect()) {
      throw new Error('Unable to connect to managed switch');
    }

    // Await each add in order so capabilities are registered in port order.
    for (let i = 1; i <= this.deviceAPI.getNumPorts(); i++) {
      await this.addPortCapabilitiesIfNeeded(i);
    }

    await this.waitForInitialCapabilityRegistrationToFinish();

    const promises: Promise<unknown>[] = [];
    for (let i = 1; i <= this.deviceAPI.getNumPorts(); i++) {
      promises.push(this.setupCapability(i));
    }

    promises.push(this.setEnergy(this.energyUsage()));
    promises.push(this.updateDeviceSettings());

    this.handleConfigurablePortsChange(this.getSetting('configurable_ports'));

    await Promise.all(promises);
    await this.setAvailable();
    this.needsFullRefresh = false;
    await this.refreshState();
  }

  async onUninit() {
    this.httpAbort.abort();
    if (this.refreshInterval) {
      this.homey.clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Adds per-port capabilities discovered at runtime so port count matches the physical switch.
   */
  private async addPortCapabilitiesIfNeeded(port: number) {
    const onoffCap = `onoff.${port}`;
    if (!this.getCapabilities().includes(onoffCap)) {
      await this.addCapability(onoffCap);
    }
    const alarmCap = `alarm_port_disconnected.${port}`;
    if (!this.getCapabilities().includes(alarmCap)) {
      await this.addCapability(alarmCap);
    }
  }

  private async setupCapability(port: number) {
    const onoffCap = `onoff.${port}`;

    if (!this.registeredCapabilities.has(onoffCap)) {
      this.registerCapabilityListener(onoffCap, this.onCapabilityOnoff.bind(this, port));
      this.registeredCapabilities.add(onoffCap);
    }

    // Avoid setting capability options (i.e. title) if it already is set since it is an expensive operation.
    // Checking if it's already set can throw an exception if it's not set.
    let needToSetOnoffTitle = true;
    let needToSetUiQuickAction = true;
    const onoffTitle = this.homey.__('settings.drivers.tp-link-managed-switch.portName', { number: port });
    try {
      needToSetOnoffTitle = onoffTitle !== this.getCapabilityOptions(onoffCap).title;
      needToSetUiQuickAction = !this.getCapabilityOptions(onoffCap).uiQuickAction;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid Capability:')) {
        // ignore if the capability is not registered because this just means it needs to be registered
      } else {
        throw error;
      }
    }
    const onoffOptionsPromise = (needToSetOnoffTitle || needToSetUiQuickAction)
      ? this.setCapabilityOptions(onoffCap, {
        title: onoffTitle,
        uiQuickAction: false,
      })
      : Promise.resolve();

    const alarmCap = `alarm_port_disconnected.${port}`;
    const alarmTitle = this.homey.__('settings.drivers.tp-link-managed-switch.portDisconnected', { number: port });
    let needToSetAlarmTitle = true;
    try {
      needToSetAlarmTitle = alarmTitle !== this.getCapabilityOptions(alarmCap).title;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid Capability:')) {
        // ignore if the capability is not registered because this just means it needs to be registered
      } else {
        throw error;
      }
    }
    const alarmOptionsPromise = needToSetAlarmTitle
      ? this.setCapabilityOptions(alarmCap, { title: alarmTitle })
      : Promise.resolve();

    await Promise.all([onoffOptionsPromise, alarmOptionsPromise]);
  }

  /**
   * Mirrors static switch metadata into read-only Homey settings so users can inspect it after pairing.
   */
  private async updateDeviceSettings(): Promise<void> {
    if (!this.deviceAPI) {
      return;
    }

    await this.setSettings({
      switchAddress: this.address,
      switchName: this.deviceAPI.getName(),
      switchMacAddress: this.deviceAPI.getMacAddress(),
      switchFirmwareVersion: this.deviceAPI.getFirmwareVersion(),
      switchHardwareVersion: this.deviceAPI.getHardwareVersion(),
      switchPortCount: String(this.deviceAPI.getNumPorts()),
    });
  }

  private waitForInitialCapabilityRegistrationToFinish(retries: number = 100, retryDelay: number = 100): Promise<void> {
    // Sometimes the registered capabilities are not registered even though the promise for registering comes before the code that uses the capability.
    // This allows all of the capabilities to register before using them.
    const registeredCapabilities = this.getCapabilities();
    const requiredCapabilities = ['onoff.favorite', 'onoff.leds'];
    if (this.deviceAPI) {
      for (let i = 1; i <= this.deviceAPI.getNumPorts(); i++) {
        requiredCapabilities.push(`onoff.${i}`);
        requiredCapabilities.push(`alarm_port_disconnected.${i}`);
      }
    }

    if (requiredCapabilities.every((capability) => registeredCapabilities.includes(capability))) {
      return Promise.resolve();
    }

    if (retries > 0) {
      return new Promise<void>((resolve) => {
        this.homey.setTimeout(resolve, retryDelay);
      }).then(() => this.waitForInitialCapabilityRegistrationToFinish(retries - 1, retryDelay));
    }

    return Promise.reject(new Error('Failed to register all required capabilities within the expected time.'));
  }

  private async refreshState() {
    if (this.deviceAPI == null || this.httpAbort.signal.aborted) {
      return Promise.resolve();
    }

    const promises = [];

    // Set the current values of each switch
    const portStatus = await this.deviceAPI.getAllPortsEnabled();
    if (portStatus) {
      const defaultPortNumber = this.getSetting('favorite_port_number') || 0;
      if (defaultPortNumber === 0) {
        promises.push(this.setCapabilityIfNeeded('onoff.favorite', true));
      } else if (defaultPortNumber > 0 && defaultPortNumber <= portStatus.length) {
        promises.push(this.setCapabilityIfNeeded('onoff.favorite', portStatus[defaultPortNumber - 1]));
      }
      for (let i = 0; i < portStatus.length; i++) {
        promises.push(this.setCapabilityIfNeeded(`onoff.${i + 1}`, portStatus[i]));
      }
    }
    const ledStatus = await this.deviceAPI.getLedsEnabled();
    if (ledStatus != null) {
      promises.push(this.setCapabilityIfNeeded('onoff.leds', ledStatus));
    }

    const allLinksStatus = await this.deviceAPI.getAllLinksUp();
    if (allLinksStatus) {
      for (let i = 0; i < allLinksStatus.length; i++) {
        const capId = `alarm_port_disconnected.${i + 1}`;
        if (this.getCapabilities().includes(capId)) {
          promises.push(this.setCapabilityIfNeeded(capId, !allLinksStatus[i]));
        }
      }
    }

    // Handle link up/down triggers
    if (allLinksStatus && this.lastAllLinksStatus && allLinksStatus.length === this.lastAllLinksStatus.length) {
      for (let port = 0; port < allLinksStatus.length; port++) {
        if (allLinksStatus[port] !== this.lastAllLinksStatus[port]) {
          const portNumber = port + 1;
          await this.linkStateChanged?.trigger(this, { port: portNumber, linkUp: allLinksStatus[port] }, {});
          if (!allLinksStatus[port]) {
            await this.alarmPortDisconnectedTrue?.trigger(this, { port: portNumber }, { port: portNumber });
          } else {
            await this.alarmPortDisconnectedFalse?.trigger(this, { port: portNumber }, { port: portNumber });
          }
        }
      }
    }
    if (allLinksStatus) {
      this.lastAllLinksStatus = allLinksStatus;
    }

    return Promise.all(promises).then(() => undefined);
  }

  private async setCapabilityIfNeeded(capabilityId: string, newValue: boolean) {
    const currentValue = this.getCapabilityValue(capabilityId);
    if (currentValue !== newValue) {
      return this.setCapabilityValue(capabilityId, newValue);
    }
    return Promise.resolve();
  }

  async onCapabilityOnoff(port: number, value: boolean) {
    this.log(`Turning switch port ${port} ${value ? 'on' : 'off'}`);
    if (this.deviceAPI == null) {
      this.log(`Unable to set the port ${port} ${value ? 'on' : 'off'} because the device is not initialized.`);
      throw new Error(`Unable to set the port ${port} ${value ? 'on' : 'off'} because the device is not initialized.`);
    }
    if (this.configurablePorts == null || this.configurablePorts[port - 1]) {
      const result = await this.deviceAPI.setPortEnabled(port, value);
      if (!result) {
        this.log(`Unable to set the port ${port} ${value ? 'on' : 'off'}`);
        throw new Error(`Unable to set the port ${port} ${value ? 'on' : 'off'}`);
      }
    } else {
      this.log(`Unable to set the port ${port} ${value ? 'on' : 'off'} because it was restricted.`);
      throw new Error(`Unable to set the port ${port} ${value ? 'on' : 'off'} because it was restricted.`);
    }
    return this.refreshState();
  }

  async onCapabilityOnoffFavorite(value: boolean) {
    const favoritePortNumber = this.getSetting('favorite_port_number') || 0;
    this.log(`Turning the favorite switch port ${favoritePortNumber} ${value ? 'on' : 'off'}`);
    if (favoritePortNumber === 0) {
      // There is no favorite port
      return this.refreshState();
    }

    return this.onCapabilityOnoff(favoritePortNumber, value);
  }

  async onSettings(params: {
    oldSettings: Record<string, unknown>;
    newSettings: Record<string, unknown>;
    changedKeys: string[];
  }) {
    const { newSettings, changedKeys } = params;
    const favoritePortNumber = newSettings.favorite_port_number;
    const configurablePorts = newSettings.configurable_ports;

    if (changedKeys.includes('favorite_port_number')) {
      await this.handleDefaultPortChange(favoritePortNumber);
    }

    if (changedKeys.includes('configurable_ports')) {
      this.handleConfigurablePortsChange(configurablePorts);
    }
  }

  private async handleDefaultPortChange(newDefaultPortNumber: unknown): Promise<void> {
    // Ensure the device actually has the port number on it
    try {
      if (!Number.isInteger(newDefaultPortNumber)) {
        throw new Error('Non-integer port number are not supported.');
      }
      const portNumber = newDefaultPortNumber as number;
      if (portNumber < 0) {
        throw new Error('Negative port number are not supported');
      }
      if (this.deviceAPI != null) {
        const maxPortNumber = this.deviceAPI.getNumPorts();
        if (portNumber > maxPortNumber) {
          throw new Error(`The maximum port number on this device is ${this.deviceAPI.getNumPorts()}.`);
        }
      }

      // Refresh the favorite switch state
      await this.refreshState();
    } catch (error) {
      if (error instanceof Error) {
        this.log('Invalid favorite port number:', error.message);
        throw new Error(`Invalid favorite port number ${error.message}`);
      } else {
        this.log('Invalid favorite port number');
        throw new Error('Invalid favorite port number');
      }
    }
  }

  private handleConfigurablePortsChange(newPorts: unknown) {
    if (typeof newPorts === 'string' && newPorts) {
      const ports = this.parsePortNumbers(newPorts);
      if (this.deviceAPI != null) {
        const maxPortNumber = this.deviceAPI.getNumPorts();
        const configurablePorts: boolean[] = new Array(maxPortNumber).fill(false);
        ports.forEach((port) => {
          if (port <= 0 || port > maxPortNumber) {
            throw new Error(`Port number out of range: ${port}`);
          }
          configurablePorts[port - 1] = true;
        });
        this.configurablePorts = configurablePorts;
      } else {
        this.configurablePorts = null;
      }
    } else {
      this.configurablePorts = null;
    }
  }

  private parsePortNumbers(input: string): number[] {
    if (!input || !input.trim()) {
      return []; // Empty value indicates all ports
    }

    const ports: number[] = [];
    const compact = input.replace(/\s+/g, '');
    const ranges = compact.split(',');

    ranges.forEach((range) => {
      if (range === '') {
        return;
      }
      const [start, end] = range.split('-').map(Number);
      if (!Number.isInteger(start) || (end !== undefined && !Number.isInteger(end))) {
        throw new Error(`Invalid port range: ${range}`);
      }

      if (end === undefined) {
        if (start < 1 || start > MAX_SWITCH_PORT_COUNT) {
          throw new Error(
            `Port must be between 1 and ${MAX_SWITCH_PORT_COUNT} (got ${start} in "${range}")`,
          );
        }
        ports.push(start);
      } else {
        if (start > end) {
          throw new Error(`Invalid range: ${range}`);
        }
        if (start < 1 || end > MAX_SWITCH_PORT_COUNT) {
          throw new Error(
            `Port range must be within 1-${MAX_SWITCH_PORT_COUNT} (got "${range}")`,
          );
        }
        for (let i = start; i <= end; i++) {
          ports.push(i);
        }
      }
    });

    if (compact.length > 0 && ports.length === 0) {
      throw new Error('No valid port numbers in list');
    }

    return ports;
  }

  async onCapabilityOnoffLeds(value: boolean) {
    this.log(`Turning the leds ${value ? 'on' : 'off'}`);

    if (this.deviceAPI == null) {
      this.log(`Unable to set the LEDs ${value ? 'on' : 'off'} because the device is not initialized.`);
      throw new Error(`Unable to set the LEDs ${value ? 'on' : 'off'} because the device is not initialized.`);
    }
    const result = await this.deviceAPI.setLedsEnabled(value);
    if (!result) {
      this.log(`Unable to set the LEDs ${value ? 'on' : 'off'}`);
      throw new Error(`Unable to set the LEDs ${value ? 'on' : 'off'}`);
    }
    return this.refreshState();
  }

  async restart() {
    this.log('Restarting managed switch');

    if (this.deviceAPI == null) {
      this.log('Unable to restart the managed switch because the device is not initialized.');
      throw new Error('Unable to restart the managed switch because the device is not initialized.');
    }
    const result = await this.deviceAPI.restart();
    if (!result) {
      this.log('Unable to restart the managed switch.');
      throw new Error('Unable to restart the managed switch.');
    }
  }

  async isLinkUp(port: number): Promise<boolean> {
    this.log(`Checking if link is up for port ${port}.`);

    if (this.deviceAPI == null) {
      this.log('Unable to check if the link is up because the device is not initialized.');
      throw new Error('Unable to check if the link is up because the device is not initialized.');
    }
    const result = await this.deviceAPI.isLinkUp(port);
    if (result == null) {
      this.log('Unable to check if the link is up.');
      throw new Error('Unable to check if the link is up.');
    }
    return result;
  }

  private energyUsage() {
    if (!this.deviceAPI) {
      throw new Error('Unable to estimate energy usage with a device that is not initialized');
    }

    // The data sheet was used for a 24 port switch.
    const wattsPerPort = 0.591;
    return {
      approximation: {
        usageConstant: this.deviceAPI.getNumPorts() * wattsPerPort,
      },
    };
  }

  public async repair(address: string, username: string, password: string) {
    this.log('Updating device');

    this.address = address;
    this.username = username;
    this.password = password;

    await this.save();
    await this.suspendRefresh();
    try {
      await this.fullRefresh();
    } finally {
      await this.resumeRefresh();
    }
  }

  public async save() {
    const promises = [];
    promises.push(this.setStoreValue('address', this.address));
    promises.push(this.setStoreValue('username', this.username));
    promises.push(this.setStoreValue('password', this.password));
    return Promise.all(promises).then(() => undefined);
  }

  public getAddress() {
    return this.getStoreValue('address');
  }

  public getUsername() {
    return this.getStoreValue('username');
  }

  public getPassword() {
    return this.getStoreValue('password');
  }

  /**
   * Resolves the number of switch ports from the live session, persisted settings, or existing `onoff.N` capabilities.
   * Used by Flow autocomplete before `deviceAPI` exists or after restart.
   */
  public getSwitchPortCount(): number {
    if (this.deviceAPI != null) {
      return this.deviceAPI.getNumPorts();
    }
    const raw = this.getSetting('switchPortCount');
    if (typeof raw === 'string' && raw !== '' && raw !== '-') {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0 && n <= MAX_SWITCH_PORT_COUNT) {
        return n;
      }
    }
    let maxPort = 0;
    for (const cap of this.getCapabilities()) {
      const m = /^onoff\.(\d+)$/.exec(cap);
      if (m) {
        const p = parseInt(m[1], 10);
        if (p > maxPort) maxPort = p;
      }
    }
    return maxPort;
  }

  public async suspendRefresh() {
    this.lastSuspendRefreshTime = Date.now();
    await this.refreshPromise?.catch(() => {}); // Wait for the ongoing refresh to finish or error but we don't care about the error we just care that it isn't concurrently executing
  }

  public async resumeRefresh() {
    this.lastSuspendRefreshTime = 0;
  }

  private setRefreshIntervalProcessing(value: boolean) {
    this.refreshIntervalProcessing = value;
  }

  private getRefreshIntervalProcessing() {
    const { refreshIntervalProcessing } = this;
    return refreshIntervalProcessing;
  }
}

export = Device;
