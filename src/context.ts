import * as SQS from 'aws-sdk/clients/sqs'

/**
 * Given a raw SQS message generates a context that can be referenced in handlers
 */
export type ContextProvider<TContext> = (sqsMessage: SQS.Types.Message) => Promise<TContext>

export interface DefaultTaskContext {
  sqsMessage: SQS.Types.Message
}

export async function defaultTaskContextProvider(
  sqsMessage: SQS.Message
): Promise<DefaultTaskContext> {
  return {
    sqsMessage
  }
}
