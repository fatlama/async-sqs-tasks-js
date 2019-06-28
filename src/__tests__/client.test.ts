import * as AWS from 'aws-sdk'
import * as AWSMock from 'aws-sdk-mock'
import * as uuid from 'uuid'
import { Consumer } from 'sqs-consumer'
import { AsyncTasksClient, RegisterOperationInput } from '../client'
import { ExamplePayload, validationFunction, handleFunction } from './test-util'

describe('AsyncTasksClient', () => {
  let client: AsyncTasksClient

  const examplePayload = {
    hello: 'world'
  }

  const existingOperation = {
    operationName: 'MyExistingOperation',
    validate: validationFunction,
    handle: handleFunction
  }

  let sendSpy: jest.SpyInstance

  beforeEach(() => {
    AWSMock.setSDKInstance(AWS)
    AWSMock.mock('SQS', 'sendMessage', { MessageId: uuid.v4() })

    const sqsClient = new AWS.SQS()
    const config = {
      defaultQueue: {
        queueUrl: 'https://foobar.com/test-queue-url'
      },
      sqsClient
    }

    client = new AsyncTasksClient(config)
    client.registerOperation<ExamplePayload>(existingOperation)

    sendSpy = jest.spyOn(sqsClient, 'sendMessage')
  })

  afterEach(() => {
    AWSMock.restore()
    jest.clearAllMocks()
  })

  describe('registerOperation', () => {
    const exampleRegisterOperationInput: RegisterOperationInput<ExamplePayload> = {
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

  describe('getConsumerInstances', () => {
    it('returns a hashmap of consumers by queue name', () => {
      const consumers = client.getConsumerInstances()

      expect(consumers['default']).toBeInstanceOf(Consumer)
    })

    it('returns a new hash map with the same instances on subsequent calls', () => {
      const consumersA = client.getConsumerInstances()
      const consumersB = client.getConsumerInstances()

      expect(consumersA['default']).toBe(consumersB['default'])
    })
  })
})
