import { Consumer } from 'sqs-consumer'
import {
  BatchSubmitTaskResponseEntry,
  BatchSubmitTaskStatus,
  SubmitAllTasksResponse,
  SubmitTaskInput,
  SubmitTaskResponse,
  TaskClient
} from './client'
import { OperationConfiguration, OperationName, OperationRouter, QueueName } from './types'
import { DefaultTaskContext } from './context'
import { InvalidPayloadError, OperationNotRegistered } from './errors'

const MAX_SQS_VISIBILITY_DELAY_SECS = 900

export class NoopClient<TContext = DefaultTaskContext> implements TaskClient<TContext> {
  private _routes: OperationRouter

  public constructor() {
    this._routes = {}
  }

  public get registeredOperations(): OperationName[] {
    return Object.keys(this._routes)
  }

  public registerOperation<TPayload>(input: OperationConfiguration<TPayload, TContext>): void {
    this._routes[input.operationName] = input
  }

  public async submitTask<T>(input: SubmitTaskInput<T>): Promise<SubmitTaskResponse> {
    const taskId = await this._routeToTask(input)

    return {
      taskId,
      messageId: 'not-a-real-message-id'
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async submitAllTasks<T = any>(
    input: SubmitTaskInput<T>[]
  ): Promise<SubmitAllTasksResponse> {
    const taskIds = await Promise.all(input.map((i): Promise<string> => this._routeToTask(i)))

    const results = taskIds.map(
      (taskId): BatchSubmitTaskResponseEntry => {
        return { taskId, status: BatchSubmitTaskStatus.SUCCESSFUL }
      }
    )

    return { results }
  }

  public generateConsumer(): Consumer {
    return new Consumer({
      queueUrl: 'http://localhost/no-op-client',
      handleMessage: async (): Promise<void> => {
        'handleMessage'
      }
    })
  }

  public generateConsumers(): Record<QueueName, Consumer> {
    return {}
  }

  private async _routeToTask<T>(input: SubmitTaskInput<T>): Promise<string> {
    const { operationName, payload } = input
    const routeConfig = this._routes[operationName]

    if (!routeConfig) {
      throw new OperationNotRegistered(operationName)
    }

    try {
      await routeConfig.validate(payload)
    } catch (error) {
      throw new InvalidPayloadError(operationName, payload, error)
    }

    // Basic sanity test to help developers out if they are using the NoopClient in development
    if (input.delaySeconds && input.delaySeconds > MAX_SQS_VISIBILITY_DELAY_SECS) {
      throw new TypeError('DelaySeconds too large. See SQS SendMessage documentation')
    }

    return 'not-a-valid-task-id'
  }
}
