export class AppError extends Error {
  constructor(message, status = 400, code = 'REQUEST_ERROR', details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assert(condition, message, status = 400, code = 'REQUEST_ERROR', details) {
  if (!condition) throw new AppError(message, status, code, details);
}

export function notFound(entity = '记录') {
  return new AppError(`${entity}不存在`, 404, 'NOT_FOUND');
}

export function forbidden(message = '没有执行该操作的权限') {
  return new AppError(message, 403, 'FORBIDDEN');
}
