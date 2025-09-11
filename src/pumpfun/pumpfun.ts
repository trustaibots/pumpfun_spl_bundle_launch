import bs58 from "bs58";
import BN from "bn.js";
import {
    Keypair,
    PublicKey,
    SystemProgram,
    Connection,
    LAMPORTS_PER_SOL,
    AddressLookupTableProgram,
    TransactionInstruction,
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createAssociatedTokenAccountIdempotentInstruction,
    TOKEN_2022_PROGRAM_ID,
    getAccount,
} from "@solana/spl-token";

import {
    getBuyTokenAmountFromSolAmount,
    PumpSdk,
    bondingCurvePda,
    creatorVaultPda,
    getPumpProgram,
    newBondingCurve,
} from "@pump-fun/pump-sdk"; // Import the PumpSdk

import { connection } from "../const";
import { feeRecipient } from "../config";

// Instantiate SDK
const pumpSdk = new PumpSdk(connection);
const pumpProgram = getPumpProgram(connection);
const global = {
    initialized: true,
    authority: new PublicKey("FFWtrEQ4B4PKQoVuHYzZq8FabGkVatYzDpEVHsK5rrhF"),
    feeRecipient: new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"),
    initialVirtualTokenReserves: new BN(1073000000000000),
    initialVirtualSolReserves: new BN(30000000000),
    initialRealTokenReserves: new BN(793100000000000),
    tokenTotalSupply: new BN(1000000000000000),
    feeBasisPoints: new BN(95),
    withdrawAuthority: new PublicKey(
        "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg"
    ),
    enableMigrate: true,
    poolMigrationFee: new BN(15000001),
    creatorFeeBasisPoints: new BN(5),
    feeRecipients: [
        new PublicKey("7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ"),
        new PublicKey("7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX"),
        new PublicKey("9rPYyANsfQZw3DnDmKE3YCQF5E8oD89UXoHn9JFEhJUz"),
        new PublicKey("AVmoTthdrX6tKt4nDjco2D775W2YK3sDhxPcMmzUAmTY"),
        new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"),
        new PublicKey("FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz"),
        new PublicKey("G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP"),
    ],
    setCreatorAuthority: new PublicKey(
        "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg"
    ),
    adminSetCreatorAuthority: new PublicKey(
        "UqN2p5bAzBqYdHXcgB6WLtuVrdvmy9JSAtgqZb3CMKw"
    ),
};

export const getTokenAmountsFromSols = async (walletBuys: number[]) => {
    const global = await pumpSdk.fetchGlobal();
    const result = [];
    let bondingCurve = newBondingCurve(global); // Initial curve

    for (const buy of walletBuys) {
        const solAmount = new BN(buy * LAMPORTS_PER_SOL); // Convert SOL to lamports
        const tokenAmount = getBuyTokenAmountFromSolAmount(global, bondingCurve, solAmount);

        // Save result
        result.push(tokenAmount);

        // Update bonding curve after purchase (manual simulation)
        bondingCurve.virtualSolReserves = bondingCurve.virtualSolReserves.add(solAmount);
        bondingCurve.virtualTokenReserves = bondingCurve.virtualTokenReserves.sub(tokenAmount);
        bondingCurve.realTokenReserves = bondingCurve.realTokenReserves.sub(tokenAmount);
    }

    return result;
}


/**
 * Create a token account for PumpFun
 */
export const createTokenAccountTxPumpFunInstruction = async (
    connection: Connection,
    mainWallet: Keypair,
    mint: PublicKey,
    is2022: boolean = false
) => {
    const instructions = [];
    let idx = 0;

    const associatedToken = getAssociatedTokenAddressSync(
        mint,
        mainWallet.publicKey,
        false,
        is2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
    );

    const info = await connection.getAccountInfo(associatedToken);

    if (!info) {
        console.log("*********** creating pumpfun ATA...", idx);
        instructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
                mainWallet.publicKey,
                associatedToken,
                mainWallet.publicKey,
                mint,
                is2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
            )
        );
    } else {
        // console.log("*********** pumpfun ATA already exists... Returning...");
        return "";
    }

    const addressList: any[] = [mint];

    const currentSlot = await connection.getSlot();
    const slots = await connection.getBlocks(currentSlot - 200);
    if (slots.length < 100) {
        throw new Error(
            `Could find only ${slots.length} ${slots} on the main fork`
        );
    }

    const [lookupTableInst, lookupTableAddress] =
        AddressLookupTableProgram.createLookupTable({
            authority: mainWallet.publicKey,
            payer: mainWallet.publicKey,
            recentSlot: slots[9],
        });

    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: mainWallet.publicKey,
        authority: mainWallet.publicKey,
        lookupTable: lookupTableAddress,
        addresses: addressList.map((item) => new PublicKey(item)),
    });

    return instructions;
};

export const sniperTokenInstructions = async (
    mint: PublicKey,
    user: PublicKey,
    creator: PublicKey,
    amount: BN,
    solAmount: BN,
    slippage: number
) => {
    try {
        let instructions = [];
        // Use the correct token program ID based on the mint
        const associatedUser = getAssociatedTokenAddressSync(mint, user, true);
        instructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
                user,
                associatedUser,
                user,
                mint
            )
        );

        const sniperIns = await pumpProgram.methods
            .buy(
                amount,
                solAmount.add(
                    solAmount
                        .mul(new BN(Math.floor(slippage * 10)))
                        .div(new BN(1000))
                ),
                { 0: false },
            )
            .accountsPartial({
                feeRecipient: new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"),
                mint,
                associatedUser,
                user,
                creatorVault: creatorVaultPda(creator),
            })
            .instruction();

        instructions.push(sniperIns);

        // const transaction = new Transaction().add(...instructions);

        // transaction.feePayer = user;
        // const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        // transaction.recentBlockhash = recentBlockhash;

        // const simulation = await connection.simulateTransaction(transaction);
        // console.log('✅ Simulation Result:', simulation);

        return instructions;
    } catch (error) {
        console.log("❌ ERROR: Buy token instruction error", error);
        throw error;
    }
};

/**
 * Generate buy instructions for PumpFun
 */
export const buyTokenInstructionPumpFun = async (
    mint: PublicKey,
    user: Keypair,
    solAmount: BN,
    slippage: number
) => {
    try {
        // Fetch necessary account data
        const {
            bondingCurveAccountInfo,
            bondingCurve,
            associatedUserAccountInfo,
        } = await pumpSdk.fetchBuyState(mint, user.publicKey);

        let amount = getBuyTokenAmountFromSolAmount(
            global,
            bondingCurve,
            solAmount
        );

        console.log("amount", amount.toNumber());

        let instructions = [];

        if (!associatedUserAccountInfo) {
            const userAta = getAssociatedTokenAddressSync(
                mint,
                user.publicKey,
                true
            );
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    user.publicKey,
                    userAta,
                    user.publicKey,
                    mint
                )
            );
        }

        let buyInstructions = await pumpSdk.buyInstructions({
            global,
            bondingCurveAccountInfo,
            bondingCurve,
            associatedUserAccountInfo,
            mint,
            user: user.publicKey,
            amount,
            solAmount,
            slippage,
        });

        instructions = [...instructions, ...buyInstructions];

        return { instructions, minOut: amount };
    } catch (error) {
        console.log("ERROR: Buy token instruction error", error);
        throw error;
    }
};

/**
 * Generate sell instructions for PumpFun
 */
export const sellTokenInstructionPumpFun = async (
    connection: Connection,
    mint: PublicKey,
    user: Keypair,
    amount: BN,
    solAmount: BN,
    slippage: number
) => {
    try {
        // Fetch necessary account data

        const bondingCurveAccountInfo = await connection.getAccountInfo(
            bondingCurvePda(mint)
        );

        if (!bondingCurveAccountInfo) {
            throw new Error("Bonding curve account info not found");
        }

        const bondingCurve = pumpSdk.decodeBondingCurve(
            bondingCurveAccountInfo
        );

        const sellInstructions = await pumpSdk.sellInstructions({
            global,
            bondingCurveAccountInfo,
            bondingCurve,
            mint,
            user: user.publicKey,
            amount,
            solAmount,
            slippage,
        });

        return { instructions: sellInstructions, minOut: solAmount };
    } catch (error) {
        console.log("ERROR: Sell token instruction error", error);
        throw error;
    }
};

/**
 * Create a token using PumpFun SDK
 */
export const createPumpFunTokenInstruction = async (
    connection: Connection,
    mint: Keypair,
    name: string,
    symbol: string,
    uri: string,
    creator: PublicKey,
    user: Keypair
) => {
    try {
        const instruction = await pumpSdk.createInstruction({
            mint: mint.publicKey,
            name,
            symbol,
            uri,
            creator,
            user: user.publicKey,
        });

        return instruction;
    } catch (error) {
        console.log("ERROR: Create token error", error);
        return null;
    }
};

/**
 * Collect creator fees from PumpFun
 */
export const collectPumpFunCreatorFeesInstruction = async (
    connection: Connection,
    coinCreator: Keypair
) => {
    try {
        const instructions = await pumpSdk.collectCoinCreatorFeeInstructions(
            coinCreator.publicKey
        );

        return instructions;
    } catch (error) {
        console.log("ERROR: Collect creator fees error", error);
        return null;
    }
};

/**
 * Get creator vault balance
 */
export const getPumpFunCreatorVaultBalance = async (
    connection: Connection,
    creator: PublicKey
): Promise<BN> => {
    return await pumpSdk.getCreatorVaultBalance(creator);
};
