import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as db from "./db";
import fs from "fs";
import {
    generateSnipers,
    getWalletBalance,
    newKeypair,
    fundWalletFromMexc,
    collectFundsFromWallet,
    collectFundsFromKeypair,
    fundWalletFromWallet,
    getTokenBalance,
    fundWalletFromHostWallet,
} from "./wallets";
import { PublicKey } from "@solana/web3.js";
import { Wallet } from "./types";
import { solWithdraw } from "./mexc";
import { connection, HOST_WALLET } from "./const";
import { transferSOL } from "./solana/utils";

export interface LaunchConfig {
    owner: Keypair;
    snipers: Wallet[];
    tokenMint: Keypair;
}

export const loadLaunchConfig = async (): Promise<LaunchConfig | undefined> => {
    const config = await db.getLaunchConfig();
    if (!config) {
        return undefined;
    }

    return config;
};

export const saveLaunchConfig = async (config: LaunchConfig): Promise<void> => {
    await db.saveLaunchConfig(config);
};

export const showLaunchConfig = async (config: LaunchConfig) => {    
    console.log(`🚀 Owner: ${config.owner.publicKey.toBase58()}`);
    console.log(`🚀 Snipers: \n${config.snipers.map((sniper) => sniper.publicKey + " " + sniper.fundPublicKey + " " + sniper.amountToBuyInSOL).join("\n")}`);
    console.log(`🚀 Token mint: ${config.tokenMint.publicKey.toBase58()}`);
}

export const prepareLaunchConfig = async (
    sniperWallets: number,
    totalSol: number = 30
): Promise<LaunchConfig> => {
    const config = {
        owner: await newKeypair(),
        snipers: await generateSnipers(sniperWallets, totalSol),
        tokenMint: await newKeypair("pump"),
    };

    console.log(`🚀 Launch config prepared successfully`);
    showLaunchConfig(config);

    await saveLaunchConfig(config);

    console.log("✅ Launch config prepared successfully");

    return config;
};

export const fundWalletsFromMEXC = async (launchConfig: LaunchConfig) => {
    const { owner, snipers, tokenMint } = launchConfig;

    // Fund owner wallet from MEXC
    await solWithdraw(owner.publicKey.toBase58(), 0.3);

    // Fund sniper wallets from MEXC async
    const success = await Promise.all(snipers.map(fundWalletFromMexc));
    if (!success.every((success) => success)) {
        console.log("❌ Failed to fund sniper wallets from MEXC");
        return false;
    }

    console.log(`✅ Funded fund wallets from MEXC`);
};

export const fundWalletsFromHostWallet = async (launchConfig: LaunchConfig) => {
    const { owner, snipers } = launchConfig;

    // Fund owner wallet from MEXC
    const ownerWalletBalance = await getWalletBalance(owner.publicKey, true);
    const solToFund = 0.2 * LAMPORTS_PER_SOL - ownerWalletBalance;

    // Fund sniper wallets from MEXC async
    const success = await Promise.all([
        transferSOL(HOST_WALLET, owner.publicKey, Math.floor(solToFund)),
        ...snipers.map(fundWalletFromHostWallet)
    ]);

    if (!success.every((success) => success)) {
        console.log("❌ Failed to fund wallets from Host Wallet");
        return false;
    }

    console.log(`✅ Funded fund wallets from Host Wallet`);
};

export const fundWalletsFromWallets = async (launchConfig: LaunchConfig) => {
    const { owner, snipers, tokenMint } = launchConfig;

    // Fund sniper wallets from MEXC async
    const success = await Promise.all(snipers.map(fundWalletFromWallet));
    if (!success.every((success) => success)) {
        console.log("❌ Failed to fund sniper wallets from fund wallets");
        return false;
    }

    console.log(`✅ Funded sniper wallets from fund wallets`);
};

export const checkWalletBalances = async (launchConfig: LaunchConfig) => {
    const { owner, snipers, tokenMint } = launchConfig;

    const ownerBalance = await getWalletBalance(owner.publicKey);
    console.log(`Owner balance: ${ownerBalance}`);

    for (let index = 0; index < snipers.length; index++) {
        const sniper = snipers[index];
        if (sniper.publicKey && sniper.fundPublicKey) {
            const sniperBalance = await getWalletBalance(
                new PublicKey(sniper.publicKey)
            );
            const fundBalance = await getWalletBalance(
                new PublicKey(sniper.fundPublicKey)
            );

            const tokenBalance = await getTokenBalance(connection, sniper.publicKey, tokenMint.publicKey.toBase58());

            console.log(
                `Sniper ${index}    fund: ${fundBalance} balance: ${sniperBalance} token balance: ${tokenBalance}`
            );
        }
    }
};

export const collectFunds = async (launchConfig: LaunchConfig) => {
    const { owner, snipers } = launchConfig;

    const success = await Promise.all([
        collectFundsFromKeypair(owner),
        ...snipers.map(collectFundsFromWallet)
    ]);
    if (!success.every((success) => success)) {
        console.log("❌ Failed to collect funds");
        return false;
    }


    console.log("✅ Collected funds");
};

export const exportLaunchConfig = async (launchConfig: LaunchConfig) => {
    const { snipers, tokenMint } = launchConfig;

    // Add tokenMint address and date to filename
    const filename = `data/snipers-${tokenMint.publicKey.toBase58()}-${new Date().toISOString().split('T')[0]}.json`;

    const snipersFile = fs.writeFileSync(filename, JSON.stringify(snipers.map((sniper) => ({
        publicKey: sniper.publicKey,
        privateKey: sniper.privateKey,
    })), null, 2));
    console.log(`✅ Snipers exported to ${snipersFile}`);
}