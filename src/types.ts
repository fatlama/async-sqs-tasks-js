/**
 * The queue identifier used by upstream clients
 * e.g. 'default', 'high'
 */
export type QueueIdentifier = string
export type OperationName = string

export interface AsyncTaskContext<T> {
  sqsMessage: AWS.SQS.Message
  task: MessageBody<T>
}

export interface QueueConfiguration {
  queueUrl: string
}

export interface MessageBody<T> {
  taskId: string
  operationName: string
  payload: T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface OperationConfiguration<T = any> {
  operationName: OperationName
  queueId?: QueueIdentifier
  /**
   * Validates the payload for correctness and throws an exception if invalid
   * @param payload
   */
  validate(payload: T): Promise<void>
  /**
   * Receives the input and is expected to handle the task
   *
   * Any thrown exception will result in the task being re-enqueued
   *
   * @param payload
   * @param ctx
   */
  handle(payload: T, ctx: AsyncTaskContext<T>): Promise<void>
}
