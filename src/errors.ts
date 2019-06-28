import { Task } from './types'

export class InvalidPayloadError extends Error {
  public operationName?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public payload?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public err?: any
}

export class MalformedRequestError extends Error {
  public request: Task

  public constructor(request: Task) {
    super('Malformed request received')
    this.request = request
    this.name = 'MalformedRequestError'
  }
}

export class OperationNotRegistered extends Error {
  public operationName: string

  public constructor(operationName: string) {
    super('No handler registered for operation')
    this.operationName = operationName
    this.name = 'OperationNotRegistered'
  }
}

export class QueueNotRegistered extends Error {
  public queueName?: string

  public constructor(queueName: string) {
    super('No queue configured for queueName')
    this.queueName = queueName
    this.name = 'QueueNotRegistered'
  }
}
