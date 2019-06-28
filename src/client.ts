import { SQS } from 'aws-sdk'
import * as uuid from 'uuid'
import {
  OperationConfiguration,
  OperationName,
  OperationRouter,
  QueueConfiguration,
  QueueName,
  Task
} from './types'
import { InvalidPayloadError, OperationNotRegistered, QueueNotRegistered } from './errors'

const DEFAULT_QUEUE_NAME = 'default'

interface ClientConfiguration {
  defaultQueue: QueueConfiguration
  /**
   * The SQS client provided to queues upon initialization
   *
   * Defaults to `new AWS.SQS()`
   */
  sqsClient?: SQS
}

export type RegisterOperationInput<T> = OperationConfiguration<T>

export interface SubmitTaskInput<T> {
  operationName: string
  payload: T
}

export interface SubmitTaskResponse {
  messageId: string | null
  taskId: string
}

/**
 * Handles configuring queues, registering operations, and enqueueing/dequeueing tasks
 * for processing
 */
export class AsyncTasksClient {
  private sqsClient: SQS
  private queues: Record<QueueName, QueueConfiguration>
  private routes: OperationRouter

  public constructor(config: ClientConfiguration) {
    this.sqsClient = config.sqsClient || new SQS()
    this.queues = {
      [DEFAULT_QUEUE_NAME]: config.defaultQueue
    }
    this.routes = {}
  }

  public get registeredOperations(): OperationName[] {
    return Object.keys(this.routes)
  }

  /**
   * Register an operation type with the asyncTask client
   *
   * Operations must have a name, a validation function, and a handler function and may
   * specify a queue on which jobs should be submitted by default
   *
   * @param input
   * @throws {QueueNotRegistered} the queueId specified is not registered
   */
  public registerOperation<T>(input: RegisterOperationInput<T>): void {
    const route = {
      queue: DEFAULT_QUEUE_NAME,
      ...input
    }

    if (typeof input.operationName !== 'string') {
      throw new TypeError('No operationName provided')
    }

    if (typeof input.validate !== 'function') {
      throw new TypeError('No validate function provided')
    }

    if (typeof input.handle !== 'function') {
      throw new TypeError('No handle function provided')
    }

    if (!this.queues[route.queue]) {
      throw new QueueNotRegistered(route.queue)
    }

    this.routes[input.operationName] = route
  }

  /**
   * Enqueues a task for a specified operation
   *
   * * Tasks must specify an operationName and a payload that can be serialized to JSON.
   * * The payload will be validated against the validation function provided when the
   *   operation was registered
   *
   * @param input
   * @throws {OperationNotRegistered} the operationName has not been configured
   * @throws {InvalidPayloadError} the provided payload did not pass validation
   * @throws {QueueNotRegistered} the specified queue is not configured
   * @returns the SQS MessageId and a unique taskId generated on our side
   */
  public async submitTask<T>(input: SubmitTaskInput<T>): Promise<SubmitTaskResponse> {
    const { operationName, payload } = input
    const routeConfig = this.routes[operationName]

    if (!routeConfig) {
      throw new OperationNotRegistered(operationName)
    }

    try {
      await routeConfig.validate(payload)
    } catch (error) {
      const validationError = new InvalidPayloadError('Payload validation failed')
      validationError.operationName = operationName
      validationError.err = error

      throw validationError
    }

    // TODO Allow routes to specify a queue
    const queueId = DEFAULT_QUEUE_NAME
    const queue = this.queues[queueId]
    if (!queue) {
      throw new QueueNotRegistered(queueId)
    }

    const taskId = uuid.v4()
    const messageBody: Task<T> = {
      taskId,
      operationName,
      payload
    }

    const sqsResponse = await this.sqsClient
      .sendMessage({
        QueueUrl: queue.queueUrl,
        MessageBody: JSON.stringify(messageBody)
      })
      .promise()

    return {
      messageId: sqsResponse.MessageId || null,
      taskId
    }
  }
}
