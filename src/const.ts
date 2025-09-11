import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js'
import * as dotenv from "dotenv";
import bs58 from 'bs58'

dotenv.config();


export const RPC_URL = process.env.RPC_URL || clusterApiUrl("mainnet-beta")

export const connection = new Connection(RPC_URL, {confirmTransactionInitialTimeout: 120000})

export const COLLECT_WALLET = new PublicKey("USNfx9qdfbWgpFPbpqnX36Lwmwabbw5QJfE9aMRYuzm");
export const PUMPFUN_LOOKUP_TABLE= new PublicKey("4qeBQqwheqHdpTeNpj6JJRT2WqTHkPeEDsiihxKNAukD");
export const HOST_WALLET = Keypair.fromSecretKey(bs58.decode(process.env.HOST_WALLET_PRIVATE_KEY ?? ""));
