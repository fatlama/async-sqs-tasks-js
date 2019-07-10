import { SQS } from 'aws-sdk'
import * as uuid from 'uuid'
import { Task } from '../types'
import { ExamplePayload } from './test-util'

export function mixedBatchResponder(
  params: SQS.SendMessageBatchRequest,
  // eslint-disable-next-line promise/prefer-await-to-callbacks,@typescript-eslint/no-explicit-any
  callback: (err: any, data: SQS.SendMessageBatchResult) => void
): void {
  const success: SQS.SendMessageBatchResultEntryList = []
  const failed: SQS.BatchResultErrorEntryList = []

  params.Entries.forEach((entry): void => {
    const task: Task<ExamplePayload> = JSON.parse(entry.MessageBody)

    if (task.payload.failOnSend) {
      failed.push({
        Id: entry.Id,
        SenderFault: true,
        Code: 'OverQuota'
      })

      return
    }

    success.push({
      Id: entry.Id,
      MessageId: uuid.v4(),
      MD5OfMessageBody: uuid.v4()
    })
  })

  // eslint-disable-next-line promise/prefer-await-to-callbacks
  callback(null, {
    Successful: success,
    Failed: failed
  })
}

export function successBatchResponder(
  params: SQS.SendMessageBatchRequest,
  // eslint-disable-next-line promise/prefer-await-to-callbacks,@typescript-eslint/no-explicit-any
  callback: (err: any, data: SQS.SendMessageBatchResult) => void
): void {
  const successful = params.Entries.map(
    (entry): SQS.SendMessageBatchResultEntry => {
      return {
        Id: entry.Id,
        MessageId: uuid.v4(),
        MD5OfMessageBody: uuid.v4()
      }
    }
  )

  // eslint-disable-next-line promise/prefer-await-to-callbacks
  callback(null, {
    Successful: successful,
    Failed: []
  })
}
