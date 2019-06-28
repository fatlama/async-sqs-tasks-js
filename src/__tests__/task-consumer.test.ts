import * as uuid from 'uuid'
import * as SQS from 'aws-sdk/clients/sqs'
import { Consumer } from 'sqs-consumer'
import { createTaskConsumer, createMessageHandler } from '../task-consumer'
import { OperationRouter } from '../types'
import {
  exampleContextProvider,
  exampleMessage,
  handleFunction,
  taskToMessage,
  validationFunction,
  validPayload,
  invalidMessage
} from './test-util'

describe('task-consumer', () => {
  let handleSpy: jest.SpyInstance
  const routes: OperationRouter = {
    Operation1: {
      operationName: 'Operation1',
      validate: validationFunction,
      handle: handleFunction
    }
  }

  const consumerConfig = {
    routes,
    contextProvider: exampleContextProvider,
    consumerOptions: {
      queueUrl: 'http://test-queue'
    }
  }

  beforeEach(() => {
    handleSpy = jest.spyOn(routes.Operation1, 'handle')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('createConsumer', () => {
    it('creates a consumer', () => {
      const consumer = createTaskConsumer(consumerConfig)
      expect(consumer).toBeInstanceOf(Consumer)
    })
  })

  describe('createMessageHandler', () => {
    const handleMessage = createMessageHandler(consumerConfig)

    it('completes without error for successful tasks', async () => {
      await handleMessage(exampleMessage)

      expect(handleSpy).toBeCalled()
    })

    it('bubbles up errors from the operation handler', async () => {
      const result = handleMessage(invalidMessage)

      await expect(result).rejects.toThrow()
    })

    it('throws an exception for invalid SQS messages', async () => {
      const result = handleMessage({})

      await expect(result).rejects.toThrow()
      expect(handleSpy).not.toBeCalled()
    })

    it('throws MalformedRequestError for non-Task messages', async () => {
      const malformedMessage: SQS.Types.Message = {
        Body: JSON.stringify({ invalid: 'task' }),
        ReceiptHandle: uuid.v4()
      }

      const result = handleMessage(malformedMessage)

      await expect(result).rejects.toThrow('Malformed request received')
      expect(handleSpy).not.toBeCalled()
    })

    it('throws OperationNotRegistered for unroutable messages', async () => {
      const unroutableMessage = taskToMessage({
        operationName: 'NopeNopeNope',
        taskId: uuid.v4(),
        payload: validPayload
      })

      const result = handleMessage(unroutableMessage)

      await expect(result).rejects.toThrow('No handler registered for operation')
      expect(handleSpy).not.toBeCalled()
    })
  })
})
