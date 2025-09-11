import mongoose from "mongoose";

export const WalletSchema = new mongoose.Schema({
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true },
    fundPublicKey: { type: String, required: true },
    fundPrivateKey: { type: String, required: true },
    amountToBuyInSOL: { type: Number, required: true },
});

export const LaunchConfigSchema = new mongoose.Schema({
    owner: {
        publicKey: { type: String, required: true },
        privateKey: { type: String, required: true },
    },
    snipers: { type: [WalletSchema], required: true },
    tokenMint: {
        publicKey: { type: String, required: true },
        privateKey: { type: String, required: true },
    },
    created: { type: Date, default: Date.now },
});

export const LaunchConfigModel = mongoose.model('LaunchConfig', LaunchConfigSchema);