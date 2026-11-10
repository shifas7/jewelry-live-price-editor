// Never log error messages or arbitrary properties: provider errors may contain credentials.
const safeNames = new Set(['MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError',
  'MongoServerError', 'MongoParseError', 'MongoAPIError', 'MongoNotConnectedError']);
export function safeError(error) {
  return { errorType: safeNames.has(error?.name) ? error.name : 'other',
    ...(Number.isInteger(error?.code) ? { errorCode: error.code } : {}) };
}
