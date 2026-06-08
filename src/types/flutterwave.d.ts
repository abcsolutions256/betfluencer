declare module 'flutterwave-node-v3' {
  class Flutterwave {
    constructor(publicKey: string, secretKey: string)
    MobileMoney: any
    Transfer: any
  }
  export = Flutterwave
}
