import * as AWS from 'aws-sdk'
import * as uuid from 'uuid'
import { SQSQueue } from './sqs-queue'
import {
  MessageBody,
  OperationConfiguration,
  OperationName,
  QueueConfiguration,
  QueueIdentifier,
  SQSClient
} from './types'
import { InvalidPayloadError, OperationNotRegistered, QueueNotRegistered } from './errors'

const DEFAULT_QUEUE = 'default'

interface ClientConfiguration {
  defaultQueue: QueueConfiguration
  /**
   * The SQS client provided to queues upon initialization
   *
   * Defaults to `new AWS.SQS()`
   */
  sqsClient?: SQSClient
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
 *
 * TODO:
 * * Add generic for task context (currently just using DefaultTaskContext)
 * * Add processTasks() method to actually process tasks
 */
export class AsyncTasksClient {
  private queues: Record<QueueIdentifier, SQSQueue>
  private routes: Record<OperationName, OperationConfiguration>

  public constructor(config: ClientConfiguration) {
    const sqsClient = config.sqsClient || new AWS.SQS()
    this.queues = {}
    this.queues[DEFAULT_QUEUE] = new SQSQueue({ ...config.defaultQueue, sqsClient })
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
      queueId: DEFAULT_QUEUE,
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

    if (!this.queues[route.queueId]) {
      throw new QueueNotRegistered(route.queueId)
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
      throw new InvalidPayloadError(operationName, error)
    }

    // TODO Allow routes to specify a queue
    const queueId = DEFAULT_QUEUE
    const queue = this.queues[queueId]
    if (!queue) {
      throw new QueueNotRegistered(queueId)
    }

    const taskId = uuid.v4()
    const messageBody: MessageBody<T> = {
      taskId,
      operationName,
      payload
    }

    const sqsResponse = await queue.sendMessage(messageBody)

    return {
      messageId: sqsResponse.MessageId || null,
      taskId
    }
  }

  // public async processTasks(): Promise<void>
}
