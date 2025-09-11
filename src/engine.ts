import {
    LOGO_PATH,
    NORMAL_TIP,
    TELEGRAM_URL,
    TOKEN_DECIMALS,
    TOKEN_DESCRIPTION,
    TOKEN_NAME,
    TOKEN_SYMBOL,
    TWITTER_URL,
    WEBSITE_URL,
} from "./config";
import { connection, HOST_WALLET, PUMPFUN_LOOKUP_TABLE } from "./const";
import { LaunchConfig } from "./launch-config";
import {
    buyTokenInstructionPumpFun,
    createPumpFunTokenInstruction,
    getTokenAmountsFromSols,
    sellTokenInstructionPumpFun,
    sniperTokenInstructions,
} from "./pumpfun/pumpfun";
import { uploadMetadataOnPinata } from "./metadata/pinata";
import fs from "fs";
import bs58 from "bs58";
import {
    AddressLookupTableAccount,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import { sleep } from "./solana/utils";
import { JitoBundler } from "./jito/jito_bundler";
import { getJitoTipAccount } from "./jito/jitoAPI";
import BN from "bn.js";
import { getTokenBalance } from "./wallets";
import { sellTokenInstructionPumpswap } from "./pumpfun/pumpswap";

const jitoBundler = new JitoBundler();

export function CreateTipInstruction(
    senderAddress: PublicKey,
    tipAmount: number
): TransactionInstruction {
    const tipAddress = getJitoTipAccount();

    return SystemProgram.transfer({
        fromPubkey: senderAddress,
        toPubkey: tipAddress,
        lamports: tipAmount,
    });
}

const makeVersionedTransaction = async (
    instructions: TransactionInstruction[],
    payer: Keypair,
    lookupTable: AddressLookupTableAccount[] = []
) => {
    return new VersionedTransaction(
        new TransactionMessage({
            payerKey: payer.publicKey,
            instructions: instructions,
            recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        }).compileToV0Message(lookupTable)
    );
};

export const launchPumpFun = async (launchConfig: LaunchConfig) => {
    if (!launchConfig) {
        throw new Error("Launch config is required");
    }

    const { owner, snipers, tokenMint } = launchConfig;
    if (!owner || !snipers || !tokenMint) {
        throw new Error("Launch config is invalid");
    }

    console.log(`🔥 Launching Pump Fun Token & Sniping...`);
    console.log(`🔥 Owner: ${owner.publicKey}`);
    console.log(`🔥 Snipers: ${snipers.length}`);
    console.log(`🔥 Token Mint: ${tokenMint.publicKey.toBase58()}`);

    console.log(`Step 1: Uploading metadata to Pinata...`);

    const metadata = {
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        image: "",
        description: TOKEN_DESCRIPTION,
        twitter: TWITTER_URL,
        telegram: TELEGRAM_URL,
        website: WEBSITE_URL,
    };

    const stream = fs.createReadStream(LOGO_PATH);
    const { imageUrl, metadataUri } = await uploadMetadataOnPinata(
        LOGO_PATH,
        stream,
        metadata
    );

    console.log(`Step 2: Creating pump fun token mint instruction...`);

    const mintInstruction = await createPumpFunTokenInstruction(
        connection,
        tokenMint,
        TOKEN_NAME,
        TOKEN_SYMBOL,
        metadataUri,
        owner.publicKey,
        owner
    );

    if (!mintInstruction) {
        throw new Error("Failed to create pump fun token instruction");
    }

    const lookupTableAccount = (await connection.getAddressLookupTable(PUMPFUN_LOOKUP_TABLE));
    const lookupTableAccounts = [lookupTableAccount.value];

    const mintTx = await makeVersionedTransaction(
        [
            mintInstruction,
            CreateTipInstruction(
                owner.publicKey,
                NORMAL_TIP * LAMPORTS_PER_SOL
            ),
        ],
        owner,
        lookupTableAccounts[0] ? [lookupTableAccounts[0]] : []
    );

    const result = await jitoBundler.sendRawBundles([mintTx], [[owner, tokenMint]], null);

    if (result) {
        console.log(`✅ Launch Pump Fun Token succeed!!!`);
        return true;
    } else {
        console.log(`⚠️ Launch Pump Fun Token failed!!!`);
        return false;
    }
};

export const launchPumpFunAndSnipe = async (launchConfig: LaunchConfig) => {
    if (!launchConfig) {
        throw new Error("Launch config is required");
    }

    const { owner, snipers, tokenMint } = launchConfig;
    if (!owner || !snipers || !tokenMint) {
        throw new Error("Launch config is invalid");
    }

    console.log(`🔥 Launching Pump Fun Token & Sniping...`);
    console.log(`🔥 Owner: ${owner.publicKey}`);
    console.log(`🔥 Snipers: ${snipers.length}`);
    console.log(`🔥 Token Mint: ${tokenMint.publicKey.toBase58()}`);

    console.log(`Step 1: Uploading metadata to Pinata...`);

    const metadata = {
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        image: "",
        description: TOKEN_DESCRIPTION,
        twitter: TWITTER_URL,
        telegram: TELEGRAM_URL,
        website: WEBSITE_URL,
    };

    const stream = fs.createReadStream(LOGO_PATH);
    const { imageUrl, metadataUri } = await uploadMetadataOnPinata(
        LOGO_PATH,
        stream,
        metadata
    );

    console.log(`Step 2: Creating pump fun token mint instruction...`);

    const mintInstruction = await createPumpFunTokenInstruction(
        connection,
        tokenMint,
        TOKEN_NAME,
        TOKEN_SYMBOL,
        metadataUri,
        owner.publicKey,
        owner
    );

    if (!mintInstruction) {
        throw new Error("Failed to create pump fun token instruction");
    }

    const lookupTableAccount = (await connection.getAddressLookupTable(PUMPFUN_LOOKUP_TABLE));
    const lookupTableAccounts = [lookupTableAccount.value];
    const signersArray = [];

    const mintTx = await makeVersionedTransaction(
        [
            mintInstruction,
            CreateTipInstruction(
                HOST_WALLET.publicKey,
                NORMAL_TIP * LAMPORTS_PER_SOL
            ),
        ],
        owner,
        lookupTableAccounts[0] ? [lookupTableAccounts[0]] : []
    );

    signersArray.push([owner, tokenMint, HOST_WALLET]);

    console.log(`Step 3: Preparing buy transactions...`);

    const buyTxs: VersionedTransaction[] = [];

    const solAmounts: number[] = snipers.map(sniper => sniper.amountToBuyInSOL || 0);
    const tokenAmounts = await getTokenAmountsFromSols(solAmounts);

    let instructions: TransactionInstruction[] = [];
    let signers: Keypair[] = [];
    const bundleSize = 4;

    for (let i = 0; i < snipers.length; i++) {
        const sniper = snipers[i];
        if (!sniper.amountToBuyInSOL || !sniper.privateKey) {
            continue;
        }

        const keypair = Keypair.fromSecretKey(bs58.decode(sniper.privateKey));
        const solAmount = sniper.amountToBuyInSOL || 0;
        const tokenAmount = tokenAmounts[i] || 0;

        console.log(`🔥 Sniper: ${keypair.publicKey.toBase58()}, Sol Amount: ${solAmount}, Token Amount: ${tokenAmount}`);

        const buyInstructions = await sniperTokenInstructions(
            tokenMint.publicKey,
            keypair.publicKey,
            owner.publicKey,
            tokenAmount,
            new BN(solAmount * LAMPORTS_PER_SOL),
            100
        );

        if (!buyInstructions) {
            continue;
        }

        instructions.push(...buyInstructions);
        signers.push(keypair);

        if (signers.length === bundleSize || i === snipers.length - 1) {
            const buyTx = await makeVersionedTransaction(instructions, signers[0], lookupTableAccounts[0] ? [lookupTableAccounts[0]] : []);
            signersArray.push(signers);
            buyTxs.push(buyTx);
    
            const txSize = buyTx.serialize().length;
            console.log(`🔥 Tx Size: ${txSize}`);
            
            instructions = [];
            signers = [];
        }

        if (buyTxs.length >= 4) break;
    }

    const result = await jitoBundler.sendRawBundles([mintTx, ...buyTxs], signersArray, null);

    if (result) {
        console.log(`✅ Bundle mint and buy succeed!!!`);
        return true;
    } else {
        console.log(`⚠️ Bundle mint and buy failed!!!`);
        return false;
    }
};

export const SnipeToken = async (launchConfig: LaunchConfig) => {
    if (!launchConfig) {
        throw new Error("Launch config is required");
    }

    const { owner, snipers, tokenMint } = launchConfig;
    if (!owner || !snipers || !tokenMint) {
        throw new Error("Launch config is invalid");
    }

    console.log(`🔥 Launching Pump Fun Token & Sniping...`);
    console.log(`🔥 Owner: ${owner.publicKey}`);
    console.log(`🔥 Snipers: ${snipers.length}`);
    console.log(`🔥 Token Mint: ${tokenMint.publicKey.toBase58()}`);

    console.log(`Step 1: Preparing buy transactions...`);

    const lookupTableAccount = (await connection.getAddressLookupTable(PUMPFUN_LOOKUP_TABLE));
    const lookupTableAccounts = [lookupTableAccount.value];

    const buyTxs: VersionedTransaction[] = [];

    const solAmounts: number[] = snipers.map(sniper => sniper.amountToBuyInSOL || 0);
    const tokenAmounts = await getTokenAmountsFromSols(solAmounts);

    let instructions: TransactionInstruction[] = [];
    let signersArray = [];
    let signers: Keypair[] = [];
    const bundleSize = 4;

    for (let i = 0; i < snipers.length; i++) {
        const sniper = snipers[i];
        if (!sniper.amountToBuyInSOL || !sniper.privateKey) {
            continue;
        }

        const keypair = Keypair.fromSecretKey(bs58.decode(sniper.privateKey));
        const solAmount = sniper.amountToBuyInSOL || 0;
        const tokenAmount = tokenAmounts[i] || 0;

        console.log(`🔥 Sniper: ${keypair.publicKey.toBase58()}, Sol Amount: ${solAmount}, Token Amount: ${tokenAmount}`);

        const buyInstructions = await sniperTokenInstructions(
            tokenMint.publicKey,
            keypair.publicKey,
            owner.publicKey,
            tokenAmount,
            new BN(solAmount * LAMPORTS_PER_SOL),
            100
        );

        if (!buyInstructions) {
            continue;
        }

        instructions.push(...buyInstructions);
        signers.push(keypair);

        if (signers.length === bundleSize || i === snipers.length - 1) {
            const buyTx = await makeVersionedTransaction(instructions, signers[0], lookupTableAccounts[0] ? [lookupTableAccounts[0]] : []);
            signersArray.push(signers);
            buyTxs.push(buyTx);
    
            const txSize = buyTx.serialize().length;
            console.log(`🔥 Tx Size: ${txSize}`);
            
            instructions = [];
            signers = [];
        }

        if (buyTxs.length >= 4) break;
    }

    const feePayer = snipers[0].privateKey ? Keypair.fromSecretKey(bs58.decode(snipers[0].privateKey)) : null;

    const result = await jitoBundler.sendRawBundles(buyTxs, signersArray, feePayer);

    if (result) {
        console.log(`✅ Bundle burn and buy succeed!!!`);
        return true;
    } else {
        console.log(`⚠️ Bundle burn and buy failed!!!`);
        return false;
    }
};

export const sellAllPumpFunToken = async (launchConfig: LaunchConfig) => {
    if (!launchConfig) {
        throw new Error("Launch config is required");
    }

    const { owner, snipers, tokenMint } = launchConfig;
    if (!owner || !snipers || !tokenMint) {
        throw new Error("Launch config is invalid");
    }

    for (const sniper of snipers) {
        if (!sniper.amountToBuyInSOL || !sniper.privateKey) {
            continue;
        }

        // const mint = new PublicKey("kHXLwdxNQAiKX52UYjWtgmgE55Yu7AcUtgYRocE6or9");
        const mint = tokenMint.publicKey;
        const keypair = Keypair.fromSecretKey(bs58.decode(sniper.privateKey));

        console.log(`🔥 Sell tokens from ${keypair.publicKey.toBase58()}`);

        const tokenBalance = await getTokenBalance(
            connection,
            keypair.publicKey.toBase58(),
            mint.toBase58()
        );

        if (!tokenBalance) {
            continue;
        }

        console.log(`🔥 Token Balance: ${tokenBalance}`);

        const sellInstructions = await sellTokenInstructionPumpFun(
            connection,
            mint,
            keypair,
            new BN(tokenBalance * Math.pow(10, TOKEN_DECIMALS)),
            new BN(0),
            100
        );
        if (!sellInstructions) {
            continue;
        }

        const sellTx = await makeVersionedTransaction(
            sellInstructions.instructions,
            keypair
        );
        sellTx.sign([keypair]);

        // try {
        //     const simTx = sellTx as any;
        //     simTx.message.recentBlockhash = (
        //         await connection.getLatestBlockhash()
        //     ).blockhash;
        //     console.log("sim res", await connection.simulateTransaction(simTx));

        //     await sleep(500);
        // } catch (e) {
        //     console.log("sim error", e);
        // }

        const result = await jitoBundler.sendBundles([sellTx], keypair);

        if (result) {
            console.log(`✅ Sell all tokens in PumpFun succeed!!!`);
        } else {
            console.log(`⚠️ Sell all tokens in PumpFun failed!!!`);
        }
    }
};

export const sellAllPumpSwapToken = async (launchConfig: LaunchConfig) => {
    if (!launchConfig) {
        throw new Error("Launch config is required");
    }

    const { owner, snipers, tokenMint } = launchConfig;
    if (!owner || !snipers || !tokenMint) {
        throw new Error("Launch config is invalid");
    }

    for (const sniper of snipers) {
        if (!sniper.amountToBuyInSOL || !sniper.privateKey) {
            continue;
        }

        // const mint = new PublicKey("2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv");
        const mint = tokenMint.publicKey;
        const keypair = Keypair.fromSecretKey(bs58.decode(sniper.privateKey));

        console.log(`🔥 Sell tokens from ${keypair.publicKey.toBase58()}`);

        const tokenBalance = await getTokenBalance(
            connection,
            keypair.publicKey.toBase58(),
            mint.toBase58()
        );

        // get pool from mint
        const pool = new PublicKey(
            "9qKxzRejsV6Bp2zkefXWCbGvg61c3hHei7ShXJ4FythA"
        );

        if (!tokenBalance) {
            continue;
        }

        console.log(`🔥 Token Balance: ${tokenBalance}`);

        const sellInstructions = await sellTokenInstructionPumpswap(
            pool,
            keypair,
            new BN(tokenBalance)
        );

        if (!sellInstructions) {
            continue;
        }

        const sellTx = await makeVersionedTransaction(
            sellInstructions.instructions,
            keypair
        );
        sellTx.sign([keypair]);

        // try {
        //     const simTx = sellTx as any;
        //     simTx.message.recentBlockhash = (
        //         await connection.getLatestBlockhash()
        //     ).blockhash;
        //     console.log("sim res", await connection.simulateTransaction(simTx));

        //     await sleep(500);
        // } catch (e) {
        //     console.log("sim error", e);
        // }

        const result = await jitoBundler.sendBundles([sellTx], keypair);

        if (result) {
            console.log(`✅ Sell all tokens in Pumpswap succeed!!!`);
        } else {
            console.log(`⚠️ Sell all tokens in Pumpswap failed!!!`);
        }
    }
};
