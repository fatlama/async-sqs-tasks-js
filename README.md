# async-sqs-tasks-js

Provides a framework for submitting and consuming tasks asynchronously, using SQS as the task store

## Terms

* Operation: a descriptor for what needs to be done and what constitutes a valid payload. e.g. 'SendEmail'
* Payload: the input for your operation. e.g. `{ recipient: 'foo@bar.com' }`
* Task: an instance of work. e.g. `Send email to recipient foo@bar.com` that contains an operationName (e.g. 'SendEmail'), a taskId, and a deserialized JSON payload (e.g. `{ recipient: 'foo@bar.com' }`)
* Handler: the method that will receive your task

## Getting Started

You will need to wire up the task client for two different aspects: submitting tasks and consuming tasks. Both will require a queue to be configured.

### Basics

At a minimum you must provide a configuration for the default queue that will be used if an operation does not specify an alternative queue

```
const client = new AsyncTasksClient({
  defaultQueue: {
    queueUrl: 'https://your-sqs-queue-url'
  }
})
```

This will by default create a new SQS default client that will be used for submitting and fetching tasks.

### Registering Operations

You must configure operations with the client before you can submit or process tasks.

An operation requires 3 parts:

* **operationName**: An identifier that will be used to route your tasks to the appropriate validation and handler. NOTE: both the task publisher and any task consumers will need to have the same mapping
* **validate**: An asynchronous function that receives a payload and makes sure it's sane, throwing an exception if not. This function will be called whenever submitTask() is called
* **handle**: An asynchronous function that receives a task along with a context and handles it, throwing an exception on failure

**NOTE**: all three parameters must be supplied regardless if this is the publisher or the consumer

```
client.registerOperation({
  operationName: 'SendEmail',
  validate: async (payload: SendEmailPayload): Promise<void> => {
    if (typeof payload.recipient !== 'string') {
      throw new TypeError('expected recipient to be a string')
    }
  },
  handle: async (task: Task<SendEmailPayload>, ctx: MyTaskContext) {
    const email = {
      to: task.payload.recipient,
      subject: 'Hello world',
      body: 'Welcome!'
    }
    await ctx.emailer.sendEmail(email)
  }
})
```

### Submitting Tasks

Once the client is configured you can use the `submitTask` function to submit a new task request. The `operationName` will be used to route to the correct operation configuration (defined in `registerOperation`) for validation. Once validated, the task will be serialized into a JSON object and enqueued on the operation's target queue for processing.

```
const { taskId } = await client.submitTask({
  operationName: 'SendEmail',
  payload: {
    recipient: 'foo@bar.com'
  }
})
// taskId: uuid
```

### Submitting Multiple Tasks

To save on network calls (and their resulting potential network failures) you can also use client.submitAllTasks to validate and then submit a batch of tasks to their assigned queues.

```
const { results } = await client.submitAllTasks([
  {
    operationName: 'SendEmail',
    payload: {
      recipient: 'foo@bar.com'
    }
  },
  {
    operationName: 'SendSMS',
    payload: {
      recipient: 'foo@bar.com'
    }
  },
  {
    operationName: 'SendPush',
    payload: {
      recipientId: 'user.v1.1234567'
    }
  }
])

> results
[
  { taskId: $uuid, status: BatchSubmitTaskStatus.SUCCESSFUL, error: undefined },
  { taskId: $uuid, status: BatchSubmitTaskStatus.FAILED, error: { code: $AWSCODE, message: $AWSMESSAGE, error: $SQSERROR }},
  { taskId: $uuid, status: BatchSubmitTaskStatus.SUCCESSFUL, error: undefined }
]
```

Notes:

* Each entry in results will be ordered according to the order of the inputs
* The same restrictions for SQS messages apply here, notable that the total payload must not exceed 256 KB

### Processing Tasks

Enqueued tasks require a worker to fetch, route, and handle the tasks. This library uses `sqs-consumer` to handle fetching tasks from SQS. The `generateConsumers` method will configure a hashmap of Consumer objects with the configured queueUrl, sqs client, and a handler function using the provided `contextProvider`.

```
const contextProvider = async (sqsMessage: AWS.SQS.Message) => {
  return {
    emailer: new Emailer(),
    sqsMessage
  }
}
const consumersByQueueName = client.generateConsumers({ contextProvider })
const defaultConsumer = consumers['default']
defaultConsumer.on('processing_error', (err, message) => {
  // throw exceptions, stat, etc
})
defaultConsumer.start()
```

More information about sqs-consumer: https://github.com/bbc/sqs-consumer

## Testing

This library also provides a NoopClient that can be used for unit testing.

```
import { AsyncTasksClient, NoopClient, TaskClient } from '@fatlama/async-sqs-tasks'

const getTasksClient(env: Environment): TaskClient {
  if (env === Environment.Test) {
    return new NoopClient()
  }

  const config = { ... }
  return new AsyncTasksClient(config)
}
```

## Contributing

### Getting Started

* To just run tests: `yarn test`
* To format the code using prettier: `yarn format`
* To run the entire build process: `yarn release`

### Publishing to NPM

Use the built-in `npm version {patch|minor}` tool to increment the version number and trigger a release

```
$ git checkout -b release-1.0.1
$ npm version patch -m "Your release message here"
$ git push --tag
```

Once approved you should be able to merge into master. This will trigger a test-build-release flow in Circle CI. You
will need to press the `confirm_publish` step and approve the publish.

NOTE: CircleCI will only listen for tags matching vX.Y.Z with any optional suffixes
