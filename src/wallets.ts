import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { COLLECT_WALLET, connection, HOST_WALLET } from "./const";
import { solWithdraw } from "./mexc";
import { Wallet } from "./types";
import { sleep, transferSOL } from "./solana/utils";
import { getAccount, getAssociatedTokenAddress, getMint } from "@solana/spl-token";

const BASE_URL = "http://localhost:3000";

export const newKeypair = async (suffix: string = "", api: boolean = true) => {
    // Call API
    if (!api) {
        return Keypair.generate();
    }

    try {
        let url = `${BASE_URL}/api/wallets/random?limit=1`;
        if (suffix === "pump") {
            url = `${BASE_URL}/api/wallets/pumpfun?limit=1`;
        } else if (suffix === "bonk") {
            url = `${BASE_URL}/api/wallets/letbonk?limit=1`;
        }
        console.log(`🔥 Fetching keypair from ${url}`);
        const response = await fetch(url);
        const data = await response.json();
        const keypair = data.keypairs[0];
        console.log(`🔥 Keypair: ${keypair.publicKey}`);

        return Keypair.fromSecretKey(bs58.decode(keypair.privateKey));
    } catch (error) {
        console.error("Error fetching keypair:", error);
        return Keypair.generate();
    }
};

function generateRandomAmounts(
    totalAmount: number,
    walletCount: number,
    minPercentage: number = 0.03,
    maxPercentage: number = 0.1
): number[] | undefined {
    if (walletCount === 0) return [];
    if (walletCount === 1) return [totalAmount];

    const min = totalAmount * minPercentage;
    const max = totalAmount * maxPercentage;

    // Calculate amounts for each group
    const regularAmount = totalAmount;
    const regularWalletCount = walletCount;

    // Validate that it's possible to satisfy constraints
    if (regularWalletCount > 0) {
        const minPossibleSum = min * regularWalletCount; // All wallets must meet minimum
        const maxPossibleSum = max * regularWalletCount; // All wallets must meet maximum

        if (regularAmount < minPossibleSum || regularAmount > maxPossibleSum) {
            console.log(
                `Cannot distribute ${regularAmount} across ${regularWalletCount} wallets with constraints [${min}, ${max}]`
            );
            return undefined;
        }
    }

    const amounts: number[] = [];
    let remainingAmount = regularAmount;

    // Generate amounts for all regular wallets
    for (let i = 0; i < regularWalletCount; i++) {
        // Calculate the valid range for this wallet
        const remainingWallets = regularWalletCount - i - 1; // Excluding current wallet
        const minNeededForRemaining = min * remainingWallets; // All remaining wallets must meet minimum
        const maxNeededForRemaining = max * remainingWallets; // All remaining wallets must meet maximum

        // This wallet's max is constrained by:
        // 1. The max parameter
        // 2. Leaving enough for remaining wallets to meet their minimums
        // 3. Not leaving too much for remaining wallets to exceed their maximums
        const walletMax = Math.min(
            max,
            remainingAmount - minNeededForRemaining
        );
        const walletMin = Math.max(
            min,
            remainingAmount - maxNeededForRemaining
        );

        // Ensure we have a valid range
        if (walletMin > walletMax) {
            throw new Error(`Cannot satisfy constraints for wallet ${i + 1}`);
        }

        // Generate random amount within the valid range
        const amount = Math.random() * (walletMax - walletMin) + walletMin;
        amounts.push(Number(amount.toFixed(4)));
        remainingAmount -= amount;
    }

    return amounts;
}

export const generateSnipers = async (walletCount: number, totalSol: number) => {
    const randomAmounts = generateRandomAmounts(totalSol, walletCount);
    if (!randomAmounts) {
        throw new Error("Failed to generate random amounts");
    }

    return await Promise.all(Array.from({ length: walletCount }, async (_, i) => {
        const keypair = await newKeypair();
        const fundKeypair = await newKeypair("", false);
        return {
            publicKey: keypair.publicKey.toBase58(),
            privateKey: bs58.encode(keypair.secretKey),
            fundPublicKey: fundKeypair.publicKey.toBase58(),
            fundPrivateKey: bs58.encode(fundKeypair.secretKey),
            amountToBuyInSOL: randomAmounts[i],
        };
    }));
};

export const getWalletBalance = async (publicKey: PublicKey, inLamports: boolean = false) => {
    const balance = await connection.getBalance(publicKey);
    return inLamports ? balance : balance / LAMPORTS_PER_SOL;
};

export const getTokenBalance = async (connection: Connection, address: string, tokenAddress: string, inDecimals: boolean = false) => {
    try {
        const owner = new PublicKey(address);
        const mint = new PublicKey(tokenAddress)
        const mintInfo = await getMint(connection, mint);
        const tokenATA = await getAssociatedTokenAddress(mint, owner);
        const tokenAccountInfo = await getAccount(connection, tokenATA, "processed");
        return inDecimals ? Number(tokenAccountInfo.amount) : Number(tokenAccountInfo.amount) / 10 ** mintInfo.decimals;
    } catch (err) {
        return 0;
    }
}

export const fundWalletFromMexc = async (sniper: Wallet) => {
    const margin = 0.02;
    const maxAttempts = 100;
    let attempts = 0;

    if (!sniper.publicKey || !sniper.fundPublicKey || !sniper.amountToBuyInSOL) {
        console.log("❌ Sniper information is undefined");
        return false;
    }

    let fundBalance = await getWalletBalance(new PublicKey(sniper.fundPublicKey));
    fundBalance = Number(fundBalance.toFixed(6));

    console.log(`🔥 Fund Balance: ${fundBalance}`);
    console.log(`🔥 Amount to Buy In SOL: ${sniper.amountToBuyInSOL}`);
    console.log(`🔥 Margin: ${margin}`);
    console.log(`🔥 Fund Amount: ${sniper.amountToBuyInSOL + margin - fundBalance}`);

    let fundAmount = sniper.amountToBuyInSOL + margin - fundBalance > 0.1 ? sniper.amountToBuyInSOL + margin - fundBalance : 0.1;
    fundAmount = Number(fundAmount.toFixed(4));

    if (fundAmount > 0) {
        console.log(`Funding wallet ${sniper.fundPublicKey} with ${fundAmount} SOL`);
    
        const success = await solWithdraw(sniper.fundPublicKey, fundAmount);
        if (!success) {
            console.log("❌ Failed to fund wallet from MEXC");
            return false;
        }
    
        await sleep(120000);
    
        while (attempts < maxAttempts) {
            const solBalance = await getWalletBalance(new PublicKey(sniper.fundPublicKey));
            if (solBalance >= Number((sniper.amountToBuyInSOL + margin).toFixed(6))) {
                console.log(`✔️ Funded wallet ${sniper.fundPublicKey} with ${fundAmount} SOL from MEXC`);
                break;
            }
            await sleep(3000);
            attempts++;
        }
    
        if (attempts === maxAttempts) {
            console.log(`❌ Failed to fund wallet ${sniper.fundPublicKey} with ${fundAmount} SOL`);
            return false;
        }
    }

    return true;
};

export const fundWalletFromHostWallet = async (sniper: Wallet) => {
    const margin = 0.011;

    if (!sniper.publicKey || !sniper.fundPublicKey || !sniper.amountToBuyInSOL) {
        console.log("❌ Sniper information is undefined");
        return false;
    }

    const fundBalance = await getWalletBalance(new PublicKey(sniper.fundPublicKey));

    const fundAmount = sniper.amountToBuyInSOL + margin - fundBalance;

    const hostBalance = await getWalletBalance(HOST_WALLET.publicKey);

    if (hostBalance < fundAmount) {
        console.log(`❌ Host wallet balance is less than fund amount, host balance: ${hostBalance}, fund amount: ${fundAmount}`);
        return false;
    }

    if (!await transferSOL(HOST_WALLET, new PublicKey(sniper.fundPublicKey), Math.floor(fundAmount * LAMPORTS_PER_SOL))) {
        console.log(`❌ Failed to transfer SOL to ${sniper.fundPublicKey}`);
        return false;
    }

    console.log(`✅ Funded wallet ${sniper.fundPublicKey} with ${sniper.amountToBuyInSOL} SOL`);

    return true;
}

export const fundWalletFromWallet = async (sniper: Wallet) => {
    const margin = 0.01;

    if (!sniper.publicKey || !sniper.fundPublicKey || !sniper.amountToBuyInSOL) {
        console.log("❌ Sniper information is undefined");
        return false;
    }

    const fundBalance = await getWalletBalance(new PublicKey(sniper.publicKey));

    const fundAmount = sniper.amountToBuyInSOL + margin - fundBalance;

    const fundKeypair = Keypair.fromSecretKey(bs58.decode(sniper.fundPrivateKey ?? ""));

    if (!await transferSOL(fundKeypair, new PublicKey(sniper.publicKey), Math.floor(fundAmount * LAMPORTS_PER_SOL))) {
        console.log(`❌ Failed to transfer SOL to ${sniper.publicKey}`);
        return false;
    }

    console.log(`✅ Funded wallet ${sniper.publicKey} with ${sniper.amountToBuyInSOL} SOL`);

    return true;
};

export const collectFundsFromKeypair = async (keypair: Keypair) => {
    const transactionFee = 0.000005;
    const balance = await getWalletBalance(keypair.publicKey, true);

    if (balance < transactionFee * LAMPORTS_PER_SOL) {
        return true;
    }

    if (!await transferSOL(keypair, COLLECT_WALLET, balance - transactionFee * LAMPORTS_PER_SOL)) {
        console.log(`❌ Failed to collect SOL from ${keypair.publicKey}`);
        return false;
    }

    console.log(`✅ Collected ${balance/LAMPORTS_PER_SOL - transactionFee} SOL from ${keypair.publicKey}`);

    return true;
}

export const collectFundsFromWallet = async (sniper: Wallet) => {
    if (!await collectFundsFromKeypair(Keypair.fromSecretKey(bs58.decode(sniper.fundPrivateKey ?? "")))) {
        console.log(`❌ Failed to collect funds from ${sniper.fundPublicKey}`);
        return false;
    }

    if (!await collectFundsFromKeypair(Keypair.fromSecretKey(bs58.decode(sniper.privateKey ?? "")))) {
        console.log(`❌ Failed to collect funds from ${sniper.publicKey}`);
        return false;
    }

    return true;
}