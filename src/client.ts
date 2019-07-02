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
}

export interface SubmitTaskResponse {
  messageId: string | null
  taskId: string
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
  submitTask<T>(input: SubmitTaskInput<T>): Promise<SubmitTaskResponse>
  generateConsumers(input: GetConsumersInput<TContext>): Record<QueueName, Consumer>
}
