import * as AWS from 'aws-sdk'
import * as AWSMock from 'aws-sdk-mock'
import * as uuid from 'uuid'
import { Consumer } from 'sqs-consumer'
import { AsyncTasksClient } from '../sqs-client'
import { defaultTaskContextProvider, DefaultTaskContext } from '../context'
import { OperationConfiguration } from '../types'
import { ExamplePayload, validationFunction, handleFunction } from './test-util'
import { mixedBatchResponder, successBatchResponder } from './aws-util'
import { BatchSubmitTaskStatus } from '../client'

describe('AsyncTasksClient', () => {
  let client: AsyncTasksClient

  const examplePayload: ExamplePayload = {
    shouldSucceed: true
  }

  const existingOperation = {
    operationName: 'MyExistingOperation',
    validate: validationFunction,
    handle: handleFunction
  }

  let sendSpy: jest.SpyInstance
  let sendBatchSpy: jest.SpyInstance

  beforeEach(() => {
    AWSMock.setSDKInstance(AWS)
    AWSMock.mock('SQS', 'sendMessage', { MessageId: uuid.v4() })
    AWSMock.mock('SQS', 'sendMessageBatch', successBatchResponder)

    const sqsClient = new AWS.SQS()
    const config = {
      defaultQueue: {
        queueUrl: 'https://foobar.com/test-queue-url'
      },
      sqsClient
    }

    client = new AsyncTasksClient<DefaultTaskContext>(config)
    client.registerOperation<ExamplePayload>(existingOperation)

    sendSpy = jest.spyOn(sqsClient, 'sendMessage')
    sendBatchSpy = jest.spyOn(sqsClient, 'sendMessageBatch')
  })

  afterEach(() => {
    AWSMock.restore()
    jest.clearAllMocks()
  })

  describe('registerOperation', () => {
    const exampleRegisterOperationInput: OperationConfiguration<ExamplePayload> = {
      operationName: 'SendPushNotification',
      validate: validationFunction,
      handle: handleFunction
    }

    it('adds the operation name to the routes', () => {
      client.registerOperation<ExamplePayload>(exampleRegisterOperationInput)

      expect(client.registeredOperations).toEqual([
        existingOperation.operationName,
        'SendPushNotification'
      ])
    })

    it('requires an operationName', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.registerOperation({ ...exampleRegisterOperationInput, operationName: null } as any)
      }).toThrowError(TypeError)
    })

    it('requires a validate method', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.registerOperation({ ...exampleRegisterOperationInput, validate: null } as any)
      }).toThrowError(TypeError)
    })

    it('requires a handle method', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.registerOperation({ ...exampleRegisterOperationInput, handle: null } as any)
      }).toThrowError(TypeError)
    })

    it('throws QueueNotRegistered if the queueId specified is not present', () => {
      expect(() => {
        client.registerOperation({ ...exampleRegisterOperationInput, queue: 'not-a-valid-queue' })
      }).toThrowError('No queue configured for queueName')
    })
  })

  describe('submitTask', () => {
    const exampleTaskRequest = {
      operationName: existingOperation.operationName,
      payload: examplePayload
    }

    it('enqueues the expected message', async () => {
      const response = await client.submitTask(exampleTaskRequest)

      expect(typeof response.messageId).toEqual('string')
      expect(typeof response.taskId).toEqual('string')

      expect(sendSpy).toBeCalledWith(
        expect.objectContaining({
          MessageBody: JSON.stringify({
            taskId: response.taskId,
            ...exampleTaskRequest
          })
        })
      )
    })

    it('allows a delaySeconds to be provided', async () => {
      const exampleWithDelay = {
        ...exampleTaskRequest,
        delaySeconds: 30
      }
      await client.submitTask(exampleWithDelay)
      expect(sendSpy).toBeCalledWith(
        expect.objectContaining({
          DelaySeconds: 30
        })
      )
    })

    it('throws an OperationNotRegistered error if an invalid operationName is specified', async () => {
      const response = client.submitTask({ ...exampleTaskRequest, operationName: 'does not exist' })
      await expect(response).rejects.toThrowError('No handler registered for operation')
    })

    it('throws an InvalidPayloadError if the payload is invalid', async () => {
      const response = client.submitTask({
        ...exampleTaskRequest,
        payload: { shouldSucceed: false }
      })
      await expect(response).rejects.toThrowError('Payload validation failed')
    })
  })

  describe('submitAllTasks', () => {
    const exampleTaskRequest = {
      operationName: existingOperation.operationName,
      payload: examplePayload
    }

    const secondTaskRequest = {
      ...exampleTaskRequest,
      payload: {
        ...examplePayload
      }
    }

    const delayedRequest = {
      operationName: existingOperation.operationName,
      payload: examplePayload,
      delaySeconds: 30
    }

    it('calls sendMessageBatch once for each assigned queue', async () => {
      const { results } = await client.submitAllTasks([exampleTaskRequest, secondTaskRequest])

      expect(results.length).toEqual(2)
      expect(results[0].taskId).toBeDefined()
      expect(results[0].status).toEqual(BatchSubmitTaskStatus.SUCCESSFUL)
      expect(results[0].error).toEqual(undefined)

      expect(sendBatchSpy).toBeCalledTimes(1)
      expect(sendSpy).not.toBeCalled()
    })

    it('passes down delaySeconds for requests', async () => {
      await client.submitAllTasks([exampleTaskRequest, delayedRequest])

      expect(sendBatchSpy).toBeCalledTimes(1)
      const input: AWS.SQS.SendMessageBatchRequest = sendBatchSpy.mock.calls[0][0]

      expect(input.Entries[0]).toEqual(
        expect.objectContaining({
          DelaySeconds: undefined
        })
      )
      expect(input.Entries[1]).toEqual(
        expect.objectContaining({
          DelaySeconds: delayedRequest.delaySeconds
        })
      )
    })

    it('does not call sendMessageBatch if validation of any task fails', async () => {
      const invalidTaskRequest = {
        ...exampleTaskRequest,
        payload: {
          shouldSucceed: false
        }
      }

      const promise = client.submitAllTasks([exampleTaskRequest, invalidTaskRequest])

      await expect(promise).rejects.toThrowError()
      expect(sendBatchSpy).not.toBeCalled()
    })

    it('classifies message status based on the errors returned by SQS', async () => {
      AWSMock.restore('SQS', 'sendMessageBatch')
      AWSMock.mock('SQS', 'sendMessageBatch', mixedBatchResponder)

      const failOnSendRequest = {
        ...exampleTaskRequest,
        payload: {
          shouldSucceed: true,
          failOnSend: true
        }
      }

      const { results } = await client.submitAllTasks([failOnSendRequest, exampleTaskRequest])
      expect(results.length).toEqual(2)
      expect(results[0].status).toEqual(BatchSubmitTaskStatus.FAILED)
      expect(results[0].error).not.toBeUndefined()

      expect(results[1].status).toEqual(BatchSubmitTaskStatus.SUCCESSFUL)
      expect(results[1].error).toBeUndefined()
    })
  })

  describe('generateConsumers', () => {
    it('returns a hashmap of consumers by queue name', () => {
      const consumers = client.generateConsumers({
        contextProvider: defaultTaskContextProvider
      })

      expect(consumers['default']).toBeInstanceOf(Consumer)
    })
  })
})
