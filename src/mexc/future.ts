import APIBase from './APIbase'
import modules from './modules'
import { flowRight } from './helpers/utils'

class Future extends flowRight(...Object.values(modules))(APIBase) {
  constructor (apiKey = '', apiSecret = '', options : any = {}) {
    options.baseURL = options.baseURL || 'https://contract.mexc.com'
    super({
      apiKey,
      apiSecret,
      ...options
    })
  }
}

export default Future;