/**
 * Generates a warm welcome to the package
 * @param {string} name the name of the greeting recipient. Defaults to 'World'
 * @return {string} the warm welcome
 */
export function sayHello(name: string = 'World'): string {
  return `Hello, ${name}`
}
