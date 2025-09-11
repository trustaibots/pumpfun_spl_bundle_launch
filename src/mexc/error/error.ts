class Error {
  message: string
  name: string

  constructor(message: string) {
    this.message = message
    this.name = 'Error'
  }
}

export default Error