import { Consumer } from 'sqs-consumer'
import { SubmitTaskInput, SubmitTaskResponse, TaskClient } from './client'
import { OperationConfiguration, OperationName, OperationRouter, QueueName } from './types'
import { DefaultTaskContext } from './context'
import { InvalidPayloadError, OperationNotRegistered } from './errors'

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
    const { operationName, payload } = input
    const routeConfig = this._routes[operationName]

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

    return {
      taskId: 'not-a-real-task-id',
      messageId: 'not-a-real-message-id'
    }
  }

  public generateConsumers(): Record<QueueName, Consumer> {
    return {}
  }
}
