import {
    Connection,
    Keypair,
    VersionedTransaction,
    SendOptions,
    Signer,
    Transaction,
    ConfirmOptions,
    ComputeBudgetProgram,
    LAMPORTS_PER_SOL,
    SystemProgram,
    TransactionMessage,
} from "@solana/web3.js";
import bs58 from "bs58";
import axios from "axios";
import { PublicKey } from "@solana/web3.js";
import { getOptimalPriceAndBudget } from "./priority";
import { connection } from "../const";

// Helper function to generate Explorer URL
export function generateExplorerTxUrl(txId: string) {
    return `https://solscan.io/tx/${txId}`;
}

export async function getSolPrice() {
    try {
        const response = await axios.get(
            "https://api.coinbase.com/v2/prices/SOL-USD/spot"
        );
        return Number(response.data.data.amount);
    } catch (error: any) {
        console.error("Error fetching SOL price:", error.message);
    }
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const prioritizeIxs = async (
    connection: Connection,
    ixs: any,
    signers: (Signer | Keypair)[]
) => {
    try {
        const transaction = new Transaction();
        const allIxs = [];

        transaction.add(...ixs);
        transaction.recentBlockhash = (
            await connection.getLatestBlockhash("finalized")
        ).blockhash;
        if (signers.length > 0) transaction.sign(...signers);
        transaction.feePayer = signers[0].publicKey;

        const [priorityFee, computeUnits] = await getOptimalPriceAndBudget(
            connection,
            transaction
        );
        // console.log('priorityFee:', priorityFee);
        // console.log('computeUnits:', computeUnits);

        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: computeUnits,
        });
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee,
        });

        allIxs.push(modifyComputeUnits);
        allIxs.push(addPriorityFee);
        allIxs.push(...ixs);

        return allIxs;
    } catch (err: any) {
        console.error(`prioritizeIxs error: ${err.message}`);
        return ixs;
    }
};

export const mySendTransaction = async (
    connection: Connection,
    transaction: VersionedTransaction | Transaction,
    signers: (Signer | Keypair)[],
    options?: SendOptions,
    maxRetries: number = 3
) => {
    if (transaction instanceof Transaction) {
        const newIxs = await prioritizeIxs(
            connection,
            transaction.instructions,
            signers
        );

        const tx = new Transaction().add(...newIxs);
        tx.recentBlockhash = (
            await connection.getLatestBlockhash("confirmed")
        ).blockhash;

        transaction = tx;

        if (signers.length > 0) transaction.sign(...signers);
    } else {
        if (signers.length > 0) transaction.sign(signers);
    }

    const rawTransaction = transaction.serialize();

    if (transaction instanceof Transaction) {
        let txMsg = {};
        try {
            txMsg = transaction.compileMessage();
        } catch (err) {
            console.error("compileMessage error:", err);
            throw new Error("Failed to compile message");
        }
    }

    let expectedTxHash: any;
    if (transaction instanceof Transaction)
        expectedTxHash = bs58.encode(
            transaction.signatures[0].signature as Uint8Array
        );
    else if (transaction instanceof VersionedTransaction)
        expectedTxHash = bs58.encode(transaction.signatures[0]);

    // if (transaction instanceof Transaction) {
    //     const simRes = await connection.simulateTransaction(transaction);
    //     if (simRes.value.err !== null) {
    //         console.log('simRes:', simRes.value.err);
    //         throw new Error("Failed to simulate transaction");
    //     }
    //     // console.log('simulated transaction:', expectedTxHash);
    // }

    try {
        await connection.sendRawTransaction(rawTransaction, {
            ...options,
            maxRetries,
        });
        return expectedTxHash;
    } catch (err: any) {
        console.error("sendTransaction error:", err.message);
        console.error("sendTransaction error:", await err.getLogs());
    }

    return "";
};

export const mySendAndConfirmTransaction = async (
    connection: Connection,
    transaction: VersionedTransaction | Transaction,
    signers: (Keypair | Signer)[],
    options?: ConfirmOptions
): Promise<string> => {
    const signature = await mySendTransaction(
        connection,
        transaction,
        signers,
        options
    );
    if (signature !== "") await connection.confirmTransaction(signature);
    return signature;
};

export const transferSOL = async (
    from: Keypair,
    to: PublicKey,
    amountInLamports: number
) => {
    const transactionFee = 0.000005;

    let bundleInstructions: any[] = [];
    const walletPublicKey = new PublicKey(from.publicKey);

    const solBalance = await connection.getBalance(
        new PublicKey(from.publicKey)
    );

    if (solBalance < LAMPORTS_PER_SOL * transactionFee + amountInLamports) return false;

    console.log(
        `Sending ${amountInLamports / LAMPORTS_PER_SOL} SOL from ${from.publicKey.toBase58()} to ${to.toBase58()}`
    );

    const instruction = SystemProgram.transfer({
        fromPubkey: walletPublicKey,
        toPubkey: to,
        lamports: amountInLamports,
    });

    bundleInstructions.push(instruction);

    const { blockhash } = await connection.getLatestBlockhash(
        "finalized"
    );
    const recentBlockhash = blockhash;

    const versionedTransaction = new VersionedTransaction(
        new TransactionMessage({
            payerKey: walletPublicKey,
            recentBlockhash: recentBlockhash,
            instructions: bundleInstructions,
        }).compileToV0Message()
    );

    const txHash = await mySendAndConfirmTransaction(
        connection,
        versionedTransaction,
        [from]
    );

    if (txHash) {
        console.log(
            `✅ Successfully sent ${amountInLamports / LAMPORTS_PER_SOL} SOL from ${from.publicKey.toBase58()} to ${to.toBase58()}. ${generateExplorerTxUrl(
                txHash
            )}`
        );
        return true;
    }

    console.log(`❌ Failed to send SOL`);
    return false;
};
