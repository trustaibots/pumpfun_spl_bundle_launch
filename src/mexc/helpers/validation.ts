import { isEmptyValue } from './utils'
import MissingParameterError from '../error/missingParameterError'

export const validateRequiredParameters = (paramObject: any) => {
  if (!paramObject || isEmptyValue(paramObject)) { throw new MissingParameterError() }
  const emptyParams: string[] = []
  Object.keys(paramObject).forEach(param => {
    if (isEmptyValue(paramObject[param])) {
      emptyParams.push(param)
    }
  })
  if (emptyParams.length) { throw new MissingParameterError(emptyParams) }
}

export const hasOneOfParameters = (paramObject: any) => {
  if (!paramObject || isEmptyValue(paramObject)) { throw new MissingParameterError() }
  const params = Object.values(paramObject)
  if (params.every(isEmptyValue)) {
    throw new MissingParameterError(Object.keys(paramObject))
  }
}