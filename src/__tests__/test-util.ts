import * as uuid from 'uuid'
import * as SQS from 'aws-sdk/clients/sqs'
import { DefaultTaskContext } from '../context'
import { Task } from '../types'

export interface ExamplePayload {
  testName?: string
  shouldSucceed: boolean
  failOnSend?: boolean
}

export const validationFunction = async (payload: ExamplePayload): Promise<void> => {
  if (payload.shouldSucceed === false) {
    throw new Error('this one failed validation')
  }
}

export const handleFunction = async (task: Task<ExamplePayload>): Promise<void> => {
  if (task.payload.shouldSucceed === false) {
    throw new Error('this handler failed')
  }
}

export const validPayload: ExamplePayload = {
  shouldSucceed: true
}

export const invalidPayload: ExamplePayload = {
  shouldSucceed: false
}

export const exampleTask: Task<ExamplePayload> = {
  operationName: 'Operation1',
  taskId: uuid.v4(),
  payload: validPayload
}

export const invalidTask: Task<ExamplePayload> = {
  operationName: 'Operation1',
  taskId: uuid.v4(),
  payload: invalidPayload
}

export function taskToMessage(task: Task<ExamplePayload>): SQS.Types.Message {
  return {
    Body: JSON.stringify(task),
    ReceiptHandle: uuid.v4()
  }
}

export const exampleMessage = taskToMessage(exampleTask)
export const invalidMessage = taskToMessage(invalidTask)

export const exampleContextProvider = async (
  sqsMessage: SQS.Types.Message
): Promise<DefaultTaskContext> => ({
  sqsMessage
})
