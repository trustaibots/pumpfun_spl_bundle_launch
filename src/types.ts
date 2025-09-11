export interface Wallet {
    publicKey?: string;
    privateKey?: string;
    fundPublicKey?: string;
    fundPrivateKey?: string;
    amountToBuyInToken?: number | undefined;
    amountToBuyInSOL?: number | undefined;
}
