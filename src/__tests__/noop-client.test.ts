import { NoopClient } from '../noop-client'
import { handleFunction, validationFunction, validPayload } from './test-util'
import { OperationConfiguration } from '../types'

describe('NoopClient', () => {
  let client: NoopClient

  const existingOperation = {
    operationName: 'ExistingOperation',
    handle: handleFunction,
    validate: validationFunction
  }

  beforeEach(() => {
    client = new NoopClient()
    client.registerOperation(existingOperation)
  })

  describe('registerOperation', () => {
    it('registers a new operation in a local map', () => {
      const operationConfig: OperationConfiguration = {
        operationName: 'Operation1',
        handle: handleFunction,
        validate: validationFunction
      }
      client.registerOperation(operationConfig)

      expect(client.registeredOperations).toEqual([existingOperation.operationName, 'Operation1'])
    })
  })

  describe('submitTask', () => {
    const exampleTaskRequest = {
      operationName: existingOperation.operationName,
      payload: validPayload
    }

    it('enqueues the expected message', async () => {
      const response = await client.submitTask(exampleTaskRequest)

      expect(typeof response.messageId).toEqual('string')
      expect(typeof response.taskId).toEqual('string')
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

  describe('generateConsumers', () => {
    it('returns an empty hash map', () => {
      expect(client.generateConsumers()).toEqual({})
    })
  })
})
