export class ServiceError extends Error {
  constructor(jobType) {
    super(`service for job type <${jobType}> is not implemented`);
    this.code = 'EBPMN_SERVICE_NOT_IMPLEMENTED';
    this.output = { statusCode: 501 };
  }
}

export class FormatError extends Error {
  constructor(elementId, err) {
    super(`<${elementId}> ${err.message}`);
    this.code = 'EBPMN_FORMAT';
    this.output = { statusCode: 500 };
  }
}
