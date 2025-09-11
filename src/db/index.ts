import mongoose from "mongoose";
import bs58 from "bs58";
import * as dotenv from "dotenv";
import { LaunchConfig } from "../launch-config";
import { LaunchConfigModel } from "./schema";
import { Keypair } from "@solana/web3.js";

dotenv.config();

const dbUrl = process.env.DB_URL || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "pump-fun-launch-script-db";

export const init = () => {
    return new Promise(async (resolve: any, reject: any) => {
        mongoose
            .connect(`${dbUrl}/${dbName}`)
            .then(() => {
                console.log(`Connected to MongoDB "${dbName}"...`);

                resolve(true);
            })
            .catch((err) => {
                console.error("Could not connect to MongoDB...", err);
                reject(false);
            });
    });
};

export const getLaunchConfig = async (): Promise<LaunchConfig | undefined> => {
    const config = await LaunchConfigModel.find({}).sort({ created: -1 }).limit(1);
    if (!config) {
        return undefined;
    }

    return {
        owner: Keypair.fromSecretKey(bs58.decode(config[0].owner?.privateKey || "")),
        snipers: config[0].snipers.map((sniper) => ({
            publicKey: sniper.publicKey,
            privateKey: sniper.privateKey,
            fundPublicKey: sniper.fundPublicKey,
            fundPrivateKey: sniper.fundPrivateKey,
            amountToBuyInSOL: sniper.amountToBuyInSOL,
        })),
        tokenMint: Keypair.fromSecretKey(bs58.decode(config[0].tokenMint?.privateKey || "")),
    };
};

export const saveLaunchConfig = async (config: LaunchConfig): Promise<void> => {
    await LaunchConfigModel.create({
        owner: {
            publicKey: config.owner.publicKey.toBase58(),
            privateKey: bs58.encode(config.owner.secretKey),
        },
        snipers: config.snipers.map((sniper) => ({
            publicKey: sniper.publicKey,
            privateKey: sniper.privateKey,
            fundPublicKey: sniper.fundPublicKey,
            fundPrivateKey: sniper.fundPrivateKey,
            amountToBuyInSOL: sniper.amountToBuyInSOL,
        })),
        tokenMint: {
            publicKey: config.tokenMint.publicKey.toBase58(),
            privateKey: bs58.encode(config.tokenMint.secretKey),
        },
    });
};
