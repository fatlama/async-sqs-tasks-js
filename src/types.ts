import * as SQS from 'aws-sdk/clients/sqs'

/**
 * The queue identifier used by upstream clients
 * e.g. 'default', 'high'
 */
export type QueueName = string
export type OperationName = string

export type OperationRouter = Record<OperationName, OperationConfiguration>

export interface DefaultTaskContext {
  sqsMessage: SQS.Types.Message
}

export interface QueueConfiguration {
  queueUrl: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Task<TPayload = any> {
  taskId: string
  operationName: string
  payload: TPayload
}

/**
 * Given a raw SQS message generates a context that can be referenced in handlers
 */
export type GetContextFn<TContext> = (sqsMessage: SQS.Types.Message) => Promise<TContext>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface OperationConfiguration<TPayload = any, TContext = any> {
  operationName: OperationName
  queue?: QueueName
  /**
   * Validates the payload for correctness and throws an exception if invalid
   * @param payload
   */
  validate(payload: TPayload): Promise<void>
  /**
   * Receives the input and is expected to handle the task
   *
   * Any thrown exception will result in the task being re-enqueued
   *
   * @param payload
   * @param ctx
   */
  handle(task: Task<TPayload>, ctx: TContext): Promise<void>
}
