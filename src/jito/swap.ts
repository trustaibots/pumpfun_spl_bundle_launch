import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js"

import { createTransferInstruction, getOrCreateAssociatedTokenAccount } from "@solana/spl-token"

import {
  TokenAccount,
  TOKEN_PROGRAM_ID,
} from '@raydium-io/raydium-sdk'
import assert from "assert"
import { sleep } from "../solana/utils"
import { connection, PRIORITY_RATE } from "../config"

export const getWalletSOLBalance = async (wallet: any): Promise<number> => {
  assert(connection)
  try {
    let balance: number = await connection.getBalance(new PublicKey(wallet.publicKey)) / LAMPORTS_PER_SOL
    return balance
  } catch (error) {
    console.log(error)
  }

  return 0
}

export const getVersionedTransaction = async (payers: any[], insts: any[], lookupAddr: any): Promise<any> => {
  try {
    const recentBlockhashForSwap = await connection.getLatestBlockhash("confirmed")

    const versionedTransaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: payers[0].publicKey,
        recentBlockhash: recentBlockhashForSwap.blockhash,
        instructions: insts,
      }).compileToV0Message(lookupAddr ? [lookupAddr] : [])
    )
    versionedTransaction.sign(payers)

    return versionedTransaction
  } catch (error) {
    console.log(error);

    await sleep(1000)

    return await getVersionedTransaction(payers, insts, lookupAddr)
  }
}

export const getTransferSOLInst = (fromWallet: any, toAddr: string, amount: number) => {
  return SystemProgram.transfer({
    fromPubkey: fromWallet.publicKey,
    toPubkey: new PublicKey(toAddr),
    lamports: Math.floor(amount * LAMPORTS_PER_SOL),
  })
}

export const getPriorityFeeInst = () => {
  const PRIORITY_FEE_INSTRUCTIONS = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE })
  return PRIORITY_FEE_INSTRUCTIONS
}

export const getTransferTokenInst = async (fromWallet: any, toAddr: string, token: any, amount: number) => {
  const from = await getOrCreateAssociatedTokenAccount(
    connection,
    fromWallet,
    new PublicKey(token.addr),
    fromWallet.publicKey
  );

  const to = await getOrCreateAssociatedTokenAccount(
    connection,
    fromWallet,
    new PublicKey(token.addr),
    new PublicKey(toAddr)
  );

  return createTransferInstruction(
    from.address,
    to.address,
    fromWallet.publicKey,
    Math.floor(amount * (10 ** token.decimal)))
}

export const sendVersionedTransaction = async (tx: VersionedTransaction, maxRetries: number = 5) => {
  try {
    const txid = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: maxRetries,
    })
    return txid
  } catch (e) {
    console.log(`sendVersionedTransaction catch error: ${e}`)
  }

}

export const simulateVersionedTransaction = async (tx: VersionedTransaction) => {
  const txid = await connection.simulateTransaction(tx)

  return txid
}

const getTokenAccountByOwnerAndMint = (mint: PublicKey) => {
  return {
    programId: TOKEN_PROGRAM_ID,
    pubkey: PublicKey.default,
    accountInfo: {
      mint: mint,
      amount: 0,
    },
  } as unknown as TokenAccount
}


