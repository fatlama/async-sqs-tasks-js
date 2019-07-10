import { NoopClient } from '../noop-client'
import { handleFunction, validationFunction, validPayload } from './test-util'
import { OperationConfiguration } from '../types'
import { BatchSubmitTaskStatus } from '../client'

describe('NoopClient', () => {
  let client: NoopClient

  const existingOperation = {
    operationName: 'ExistingOperation',
    handle: handleFunction,
    validate: validationFunction
  }

  const exampleTaskRequest = {
    operationName: existingOperation.operationName,
    payload: validPayload
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

  describe('submitAllTasks', () => {
    const secondTaskRequest = {
      ...exampleTaskRequest,
      payload: validPayload
    }

    it('returns an entry for each submitted message', async () => {
      const { results } = await client.submitAllTasks([exampleTaskRequest, secondTaskRequest])

      expect(results.length).toEqual(2)
      expect(results[0].taskId).toBeDefined()
      expect(results[0].status).toEqual(BatchSubmitTaskStatus.SUCCESSFUL)
      expect(results[0].error).toEqual(undefined)
    })
    it('throws the exception if validation of any task fails', async () => {
      const invalidTaskRequest = {
        ...exampleTaskRequest,
        payload: {
          shouldSucceed: false
        }
      }

      const promise = client.submitAllTasks([exampleTaskRequest, invalidTaskRequest])

      await expect(promise).rejects.toThrowError()
    })
  })

  describe('generateConsumers', () => {
    it('returns an empty hash map', () => {
      expect(client.generateConsumers()).toEqual({})
    })
  })
})
