import Error from '../error/error'

export default class MissingParameterError extends Error {
  constructor(paramNames: string[] | null = null) {
    super(`One or more of required parameters is missing: ${paramNames ? paramNames.slice().join(', ') : ''} `)
    this.name = 'MissingParameterError'
  }
}
