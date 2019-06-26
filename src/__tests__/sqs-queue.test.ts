import * as AWSMock from 'aws-sdk-mock'
import * as AWS from 'aws-sdk'
import * as uuid from 'uuid'
import { SQSQueue } from '../sqs-queue'

describe('SQSQueue', () => {
  const queueUrl = 'https://foobar.com/my-example-queue'
  let sqsClient: AWS.SQS
  let sendSpy: jest.SpyInstance
  let receiveSpy: jest.SpyInstance
  let queue: SQSQueue

  const exampleMessage: AWS.SQS.Message = {
    MessageId: uuid.v4(),
    Body: JSON.stringify({ hello: 'world' })
  }

  beforeEach(() => {
    AWSMock.setSDKInstance(AWS)
    AWSMock.mock('SQS', 'sendMessage', { MessageId: uuid.v4() })
    AWSMock.mock('SQS', 'receiveMessage', { Messages: [exampleMessage] })

    sqsClient = new AWS.SQS({ region: 'test-1' })
    queue = new SQSQueue({ queueUrl, sqsClient })

    sendSpy = jest.spyOn(sqsClient, 'sendMessage')
    receiveSpy = jest.spyOn(sqsClient, 'receiveMessage')
  })

  afterEach(() => {
    AWSMock.restore()
  })

  describe('sendMessage', () => {
    it('calls the sqs client with the JSON-ified message body and the configured queueUrl', async () => {
      const message = { hello: 'world' }
      await queue.sendMessage(message)

      expect(sendSpy).toBeCalledWith({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message)
      })
    })
  })

  describe('fetchMessages', () => {
    it('calls the sqs client with the configured maxNumberOfMessages and waitTimeSeconds', async () => {
      const queue = new SQSQueue({
        queueUrl,
        sqsClient,
        maxNumberOfMessages: 7,
        waitTimeSeconds: 23
      })

      await queue.fetchMessages()

      expect(receiveSpy).toBeCalledWith({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 7,
        WaitTimeSeconds: 23
      })
    })

    it('provides a sane default for MaxNumberOfMessages and WaitTimeSeconds', async () => {
      await queue.fetchMessages()

      expect(receiveSpy).toBeCalledWith({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 30
      })
    })

    it('returns the retrieved messages', async () => {
      const response = await queue.fetchMessages()
      expect(response).toEqual([exampleMessage])
    })
  })
})
