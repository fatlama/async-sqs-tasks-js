// https://rclayton.silvrback.com/custom-errors-in-node-js
class InternalError extends Error {
  public type?: string

  public constructor(message: string) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class InvalidPayloadError extends InternalError {
  public operationName: string | null
  public err: unknown

  public constructor(operationName: string, err?: unknown) {
    super('Payload validation failed')
    this.type = 'asyncTasks.InvalidPayloadError'
    this.operationName = operationName || null
    this.err = err
  }
}

export class OperationNotRegistered extends InternalError {
  public operationName: string

  public constructor(operationName: string) {
    super('Async operation is not registered')
    this.type = 'asyncTasks.OperationNotRegistered'
    this.operationName = operationName
  }
}

export class QueueNotRegistered extends InternalError {
  public queueId: string

  public constructor(queueId: string) {
    super('No queue configured for queueId')
    this.queueId = queueId
  }
}
