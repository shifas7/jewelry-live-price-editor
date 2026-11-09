export class IntegrationError extends Error {
  constructor(code, { disposition = 'failed', httpStatus, retryAfterSeconds } = {}) {
    super(code);
    this.name = 'IntegrationError';
    this.code = code;
    this.disposition = disposition;
    this.httpStatus = httpStatus;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
