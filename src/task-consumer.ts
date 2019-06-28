import * as SQS from 'aws-sdk/clients/sqs'
import { Consumer, ConsumerOptions } from 'sqs-consumer'
import {
  DefaultTaskContext,
  GetContextFn,
  OperationName,
  OperationConfiguration,
  Task,
  OperationRouter
} from './types'
import { OperationNotRegistered, MalformedRequestError } from './errors'

export async function getDefaultTaskContext(sqsMessage: SQS.Message): Promise<DefaultTaskContext> {
  return {
    sqsMessage
  }
}

/**
 * Deserializes the SQS message, routes it, and invokes the handler
 *
 * NOTE: Only exported for testing purposes
 *
 * @throws {MalformedRequestError} the request body is missing required keys
 * @throws {OperationNotRegistered} the operationName is not registered in the router
 */
async function handleMessage<TContext>(
  message: SQS.Types.Message,
  ctxProvider: GetContextFn<TContext>,
  routes: OperationRouter
): Promise<void> {
  if (!message.Body) {
    throw new TypeError('expected message to have a body')
  }

  const task: Task = JSON.parse(message.Body)
  if (!task.operationName || !task.taskId || !task.payload) {
    throw new MalformedRequestError(task)
  }

  const route = routes[task.operationName]
  if (!route) {
    throw new OperationNotRegistered(task.operationName)
  }

  const ctx = await ctxProvider(message)

  await route.handle(task, ctx)
}

export type MessageHandlerFn = (message: SQS.Types.Message) => Promise<void>

export function createMessageHandler<TContext>(
  config: CreateConsumerInput<TContext>
): MessageHandlerFn {
  if (!config.routes) {
    throw new TypeError('routes configuration required')
  }
  if (typeof config.getContext !== 'function') {
    throw new TypeError('getContext required')
  }

  return async (message: SQS.Types.Message): Promise<void> => {
    await handleMessage<TContext>(message, config.getContext, config.routes)
  }
}

export interface CreateConsumerInput<ContextType> {
  queueUrl: string
  routes: Record<OperationName, OperationConfiguration>
  getContext(message: SQS.Types.Message): Promise<ContextType>
  consumerOptions?: ConsumerOptions
}

export function createTaskConsumer<TContext>(config: CreateConsumerInput<TContext>): Consumer {
  const handleMessage = createMessageHandler(config)

  return Consumer.create({
    ...config.consumerOptions,
    queueUrl: config.queueUrl,
    handleMessage
  })
}
