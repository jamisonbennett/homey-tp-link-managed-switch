'use strict';

export interface ILogger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

class Logger {
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  public log(...args: unknown[]): void {
    this.logger.log(...args);
  }

  public error(...args: unknown[]): void {
    this.logger.error(...args);
  }
}

export default Logger;
