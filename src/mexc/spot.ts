import APIBase from './APIbase'
import modules from './modules'
import { flowRight } from './helpers/utils'

class Spot extends flowRight(...Object.values(modules))(APIBase) {
  constructor (apiKey = '', apiSecret = '', options : any = {}) {
    options.baseURL = options.baseURL || 'https://api.mexc.com' 
    super({
      apiKey,
      apiSecret,
      ...options
    })
  }
}

export default Spot