import * as AWS from 'aws-sdk'

export const DEFAULT_MAX_NUMBER_OF_MESSAGES = 5
export const DEFAULT_WAIT_TIME_SECONDS = 30

export type SQSClient = Pick<AWS.SQS, 'sendMessage' | 'receiveMessage'>

interface SQSQueueConfig {
  queueUrl: string
  /**
   * Use the provided SQS client for sending/receiving messages.
   *
   * A new SQS client will be initialized if no client is provided
   */
  sqsClient?: SQSClient
  /**
   * The maximum number of messages to fetch per poll. Defaults to DEFAULT_MAX_NUMBER_OF_MESSAGES
   *
   * Set this lower to process fewer messages per poll cycle (more distributed)
   */
  maxNumberOfMessages?: number
  /**
   * Number of seconds to wait per poll cycle before returning the results.
   * * 0 means no long poll
   * * Defaults to DEFAULT_WAIT_TIME_SECONDS
   */
  waitTimeSeconds?: number
}

/**
 * Provides a simplified interface for reading and writing to an SQS queue
 */
export class SQSQueue {
  private config: SQSQueueConfig
  private sqsClient: SQSClient

  /**
   * The maximum number of messages to fetch per poll
   */
  private maxNumberOfMessages: number
  /**
   * Enable long polling by awaiting until messages are available or the specified seconds have elapsed
   */
  private waitTimeSeconds: number

  public constructor(config: SQSQueueConfig) {
    this.config = config
    this.sqsClient = config.sqsClient || new AWS.SQS()
    this.maxNumberOfMessages = config.maxNumberOfMessages || DEFAULT_MAX_NUMBER_OF_MESSAGES
    this.waitTimeSeconds = config.waitTimeSeconds || DEFAULT_WAIT_TIME_SECONDS
  }

  /**
   * Encode the body as a JSON string and then send a message to the specified
   * @param body the data capable of being encoded as a JSON object
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async sendMessage<T = any>(body: T): Promise<AWS.SQS.Message> {
    return this.sqsClient
      .sendMessage({
        QueueUrl: this.config.queueUrl,
        MessageBody: JSON.stringify(body)
      })
      .promise()
  }

  /**
   * Fetches maxNumberOfMessages from the SQS queue. Will await up to waitTimeSeconds for messages
   */
  public async fetchMessages(): Promise<AWS.SQS.Message[]> {
    const response = await this.sqsClient
      .receiveMessage({
        QueueUrl: this.config.queueUrl,
        WaitTimeSeconds: this.waitTimeSeconds,
        MaxNumberOfMessages: this.maxNumberOfMessages
      })
      .promise()

    return response.Messages || []
  }
}
