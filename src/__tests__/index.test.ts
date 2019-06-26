import { sayHello } from '../index'

describe('sayHello', () => {
  it('returns the default greeting with no argument', () => {
    const result = sayHello()
    expect(result).toEqual('Hello, World')
  })

  it('returns the warm welcome for the specified name', () => {
    const result = sayHello('Larry the Llama')
    expect(result).toEqual('Hello, Larry the Llama')
  })
})
