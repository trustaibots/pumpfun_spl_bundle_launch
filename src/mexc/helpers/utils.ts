import axios from 'axios'
import { Console, timeStamp } from 'console'
import { encode } from 'punycode'

export const removeEmptyValue = (obj: any) => {
  if (!(obj instanceof Object)) return {}
  Object.keys(obj).forEach(key => isEmptyValue(obj[key]) && delete obj[key])
  return obj
}

export const isEmptyValue = (input: any) => {
  return (!input && input !== false && input !== 0) ||
    ((typeof input === 'string' || input instanceof String) && /^\s+$/.test(input as string)) ||
    (input instanceof Object && !Object.keys(input).length) ||
    (Array.isArray(input) && !input.length)
}

export const stringifyKeyValuePair = ([key, value]: [string, any]) => {
  let valueString;
  if (typeof value === 'object') {
    valueString = JSON.stringify(value);
  } else {
    valueString = value;
  }
  return `${key}=${encodeURIComponent(valueString)}`;
};

export const buildQueryString = (params: any) => {
  if (!params) return '';
  return Object.entries(params)
    .map(stringifyKeyValuePair)
    .join('&');
};

export const CreateRequest = (config: any) => {
  const { baseURL, method, url, params, apiKey, timestamp, Signature } = config
  if (method === 'GET' || method === 'DELETE') {
    return getRequestInstance({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        'ApiKey': apiKey,
        'Request-Time': timestamp,
        'Signature': Signature
      },
    }).request({
      method,
      url,
      params
    })
  }
  if (method === 'POST') {
    return getRequestInstance({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        'ApiKey': apiKey,
        'Request-Time': timestamp,
        'Signature': Signature
      },
    }).request({
      method,
      url,
      data: params
    })
  }
}

export const getRequestInstance = (config: any) => {
  return axios.create({
    ...config
  })
}

export const createRequest = (config: any) => {
  const { baseURL, apiKey, method, url } = config
  return getRequestInstance({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      'X-MEXC-APIKEY': apiKey,
    }
  }).request({
    method,
    url
  })
}


export const pubRequest = (config: any) => {
  const { apiKey, method, url } = config
  return getRequestInstance({
    baseURL: 'https://www.mexc.com',
    headers: {
      'Content-Type': 'application/json',
      'X-MEXC-APIKEY': apiKey,
    }
  }).request({
    method,
    url
  })
}

export const flowRight = (...functions: any[]) => (input: any) => functions.reduceRight(
  (input, fn) => fn(input),
  input
)

export const defaultLogger = new Console({
  stdout: process.stdout,
  stderr: process.stderr
})
