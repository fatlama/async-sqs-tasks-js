import { SQS } from 'aws-sdk'
import * as uuid from 'uuid'
import { Consumer } from 'sqs-consumer'
import { createTaskConsumer, getDefaultTaskContext } from './task-consumer'
import {
  DefaultTaskContext,
  GetContextFn,
  OperationConfiguration,
  OperationName,
  OperationRouter,
  QueueConfiguration,
  QueueName,
  Task
} from './types'
import { InvalidPayloadError, OperationNotRegistered, QueueNotRegistered } from './errors'

const DEFAULT_QUEUE_NAME = 'default'

export interface ClientConfiguration<TContext> {
  defaultQueue: QueueConfiguration
  /**
   * Async method invoked for each message that arrives to generate a context
   *
   * Defaults to a method that returns DefaultTaskContext
   */
  getContext?: GetContextFn<TContext>
  /**
   * Optionally specify additional queues aside from the requisite default queue
   */
  queues?: Record<QueueName, QueueConfiguration>
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
export class AsyncTasksClient<TContext = DefaultTaskContext> {
  private sqsClient: SQS
  private queues: Record<QueueName, QueueConfiguration>
  private routes: OperationRouter
  private getContext: GetContextFn<TContext>
  private consumers: Record<QueueName, Consumer>

  public constructor(config: ClientConfiguration<TContext>) {
    this.getContext = (config.getContext || getDefaultTaskContext) as GetContextFn<TContext>
    this.queues = {
      ...config.queues,
      [DEFAULT_QUEUE_NAME]: config.defaultQueue
    }
    this.sqsClient = config.sqsClient || new SQS()

    this.routes = {}
    this.consumers = {}
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
      queue: input.queue || DEFAULT_QUEUE_NAME,
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

    const queueName = routeConfig.queue || DEFAULT_QUEUE_NAME
    const queue = this.queues[queueName]
    if (!queue) {
      throw new QueueNotRegistered(queueName)
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

  public getConsumerInstances(): Record<QueueName, Consumer> {
    if (Object.values(this.consumers).length === 0) {
      this.consumers = this._createQueueConsumers()
    }

    return { ...this.consumers }
  }

  private _createQueueConsumers(): Record<QueueName, Consumer> {
    const queueNames = Object.keys(this.queues)
    const consumers: Record<QueueName, Consumer> = {}

    queueNames.forEach((queueName): void => {
      consumers[queueName] = createTaskConsumer<TContext>({
        queueUrl: this.queues[queueName].queueUrl,
        routes: this.routes,
        getContext: this.getContext,
        consumerOptions: {
          sqs: this.sqsClient
        }
      })
    })

    return consumers
  }
}
