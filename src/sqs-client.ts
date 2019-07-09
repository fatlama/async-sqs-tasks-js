import { SQS } from 'aws-sdk'
import * as uuid from 'uuid'
import { Consumer } from 'sqs-consumer'
import { DefaultTaskContext } from './context'
import { createTaskConsumer } from './task-consumer'
import {
  BatchSubmitTaskResponseEntry,
  BatchSubmitTaskStatus,
  GetConsumersInput,
  SubmitAllTasksResponse,
  SubmitTaskInput,
  SubmitTaskResponse,
  TaskClient
} from './client'
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

interface RouteToTaskOutput<T> {
  task: Task<T>
  queueName: QueueName
}

export interface ClientConfiguration {
  defaultQueue: QueueConfiguration
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

/**
 * Handles configuring queues, registering operations, and enqueueing/dequeueing tasks
 * for processing
 */
export class AsyncTasksClient<TContext = DefaultTaskContext> implements TaskClient<TContext> {
  private sqsClient: SQS
  private queues: Record<QueueName, QueueConfiguration>
  private routes: OperationRouter

  public constructor(config: ClientConfiguration) {
    this.queues = {
      ...config.queues,
      [DEFAULT_QUEUE_NAME]: config.defaultQueue
    }
    this.sqsClient = config.sqsClient || new SQS()

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
   * @throws {QueueNotRegistered} the queueId specified is not registered
   */
  public registerOperation<TPayload>(input: OperationConfiguration<TPayload, TContext>): void {
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
   * @throws {OperationNotRegistered} the operationName has not been configured
   * @throws {InvalidPayloadError} the provided payload did not pass validation
   * @throws {QueueNotRegistered} the specified queue is not configured
   * @returns the SQS MessageId and a unique taskId generated on our side
   */
  public async submitTask<T>(input: SubmitTaskInput<T>): Promise<SubmitTaskResponse> {
    const { queueName, task } = await this._routeToTask<T>(input)

    const queue = this.queues[queueName]
    const sqsResponse = await this.sqsClient
      .sendMessage({
        QueueUrl: queue.queueUrl,
        MessageBody: JSON.stringify(task)
      })
      .promise()

    return {
      messageId: sqsResponse.MessageId || null,
      taskId: task.taskId
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async submitAllTasks<T = any>(
    input: SubmitTaskInput<T>[]
  ): Promise<SubmitAllTasksResponse> {
    const routableTasks = await Promise.all(
      input.map((i): Promise<RouteToTaskOutput<T>> => this._routeToTask(i))
    )

    // Group tasks as messages assigned to their target queue
    const messagesByQueue: Record<QueueName, SQS.SendMessageBatchRequestEntryList> = {}
    routableTasks.forEach((routableTask): void => {
      const { queueName, task } = routableTask
      if (!messagesByQueue[queueName]) {
        messagesByQueue[queueName] = []
      }
      messagesByQueue[queueName].push({
        Id: task.taskId,
        MessageBody: JSON.stringify(task)
      })
    })

    // Submit each queue's batch of tasks
    const responsesByTaskId: Record<string, SQS.SendMessageBatchResultEntry> = {}
    const failedByTaskId: Record<string, SQS.BatchResultErrorEntry> = {}

    const queueNames = Object.keys(messagesByQueue)
    const sendPromises = queueNames.map(
      async (queueName): Promise<void> => {
        const { queueUrl } = this.queues[queueName]
        const results = await this.sqsClient
          .sendMessageBatch({
            QueueUrl: queueUrl,
            Entries: messagesByQueue[queueName]
          })
          .promise()

        results.Successful.forEach((result): void => {
          responsesByTaskId[result.Id] = result
        })

        results.Failed.forEach((result): void => {
          failedByTaskId[result.Id] = result
        })
      }
    )

    await Promise.all(sendPromises)

    // Use the order of the routableTasks to generate an ordered array of responses
    const results = routableTasks.map(
      (routable): BatchSubmitTaskResponseEntry => {
        const { taskId } = routable.task
        if (failedByTaskId[taskId]) {
          return { taskId, status: BatchSubmitTaskStatus.FAILED, error: failedByTaskId[taskId] }
        }

        return { taskId, status: BatchSubmitTaskStatus.SUCCESSFUL }
      }
    )

    return { results }
  }

  public generateConsumers(input: GetConsumersInput<TContext>): Record<QueueName, Consumer> {
    const queueNames = Object.keys(this.queues)
    const consumers: Record<QueueName, Consumer> = {}

    queueNames.forEach((queueName): void => {
      consumers[queueName] = createTaskConsumer<TContext>({
        routes: this.routes,
        contextProvider: input.contextProvider,
        consumerOptions: {
          sqs: this.sqsClient,
          ...input.consumerOpts,
          queueUrl: this.queues[queueName].queueUrl
        }
      })
    })

    return consumers
  }

  private async _routeToTask<T>(input: SubmitTaskInput<T>): Promise<RouteToTaskOutput<T>> {
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
    if (!this.queues[queueName]) {
      throw new QueueNotRegistered(queueName)
    }

    const taskId = uuid.v4()
    const task: Task<T> = {
      taskId,
      operationName,
      payload
    }

    return {
      queueName,
      task
    }
  }
}
