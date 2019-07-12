import { Consumer, ConsumerOptions } from 'sqs-consumer'
import { ContextProvider, DefaultTaskContext } from './context'
import { OperationConfiguration, OperationName, QueueName } from './types'

export interface GetConsumersInput<TContext = DefaultTaskContext> {
  contextProvider: ContextProvider<TContext>
  consumerOpts?: ConsumerOptions
}

export interface SubmitTaskInput<T> {
  operationName: string
  payload: T

  /**
   * Number of seconds to wait before making the message visible. Defaults to 0
   *
   * Max allowed value by SQS is 900 (15 minutes)
   *
   * More Info: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html
   */
  delaySeconds?: number
}

export interface SubmitTaskResponse {
  messageId: string | null
  taskId: string
}

export enum BatchSubmitTaskStatus {
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED'
}

export interface BatchSubmitTaskError {
  message?: string
  code?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any
}

export interface BatchSubmitTaskResponseEntry {
  taskId: string
  status: BatchSubmitTaskStatus
  error?: BatchSubmitTaskError
}

export interface SubmitAllTasksResponse {
  /**
   * An ordered array of responses for each task request submitted
   */
  results: BatchSubmitTaskResponseEntry[]
}

/**
 * An interface representing the operations guaranteed to be present regardless of the SQS task client
 * or the NoopClient
 */
export interface TaskClient<TContext> {
  /**
   * Returns a list of operations registered with the client
   */
  registeredOperations: OperationName[]

  /**
   * Register an operation type with the asyncTask client
   *
   * Operations must have a name, a validation function, and a handler function and may
   * specify a queue on which jobs should be submitted by default
   *
   * @throws {QueueNotRegistered} the queueId specified is not registered
   */
  registerOperation<TPayload>(input: OperationConfiguration<TPayload, TContext>): void

  /**
   * Enqueues a task for a specified operation
   *
   * * Tasks must specify an operationName and a payload that can be serialized to JSON.
   * * The payload will be validated against the validation function provided when the
   *   operation was registered
   *
   * @throws {OperationNotRegistered} the operationName has not been configured
   * @throws {InvalidPayloadError} the provided payload did not pass validation
   * @returns the SQS MessageId and a unique taskId generated on our side
   */
  submitTask<TPayload>(input: SubmitTaskInput<TPayload>): Promise<SubmitTaskResponse>

  /**
   * First validates all payloads and then submits the batch of messages as one call to SQS
   *
   * Results will be returned in an array in the same order as the submitted tasks
   *
   * @param input An array of tasks to submit
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submitAllTasks<TPayload = any>(
    input: SubmitTaskInput<TPayload>[]
  ): Promise<SubmitAllTasksResponse>

  generateConsumers(input: GetConsumersInput<TContext>): Record<QueueName, Consumer>
}
