import { Task } from '../types'

export interface ExamplePayload {
  hello: string
}

export const validationFunction = async (payload: ExamplePayload): Promise<void> => {
  if (payload.hello !== 'world') {
    throw new Error('expected greeting to be for the world')
  }
}

export const handleFunction = async (task: Task<ExamplePayload>): Promise<void> => {
  if (task.payload.hello !== 'world') {
    throw new Error('you should greet the world instead')
  }
}
