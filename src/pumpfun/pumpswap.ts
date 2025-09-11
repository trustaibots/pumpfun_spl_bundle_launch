import bs58 from "bs58";
import BN from "bn.js";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
  AddressLookupTableProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import { PumpAmmSdk, PumpAmmInternalSdk, buyQuoteInputInternal, sellBaseInputInternal, sellQuoteInputInternal } from "@pump-fun/pump-swap-sdk";
import { connection } from "../const";

// Initialize SDK
const pumpAmmSdk = new PumpAmmSdk(connection);
const pumpAmmInternalSdk = new PumpAmmInternalSdk(connection);

export const createTokenAccountTxPumpswapInstruction = async (
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
    console.log("*********** creating pumpswap ATA...", idx);
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
    // console.log("*********** pumpswap ATA already exists... Returning...");
    return "";
  }

  const addressList: any[] = [];
  // if (poolType == "AMM") {
  addressList.push(mint)
  // addressList.push(poolKeys.programId);
  // addressList.push(poolKeys.id);
  // addressList.push(poolKeys.mintA.address);
  // addressList.push(poolKeys.mintA.programId);
  // addressList.push(poolKeys.mintB.address);
  // addressList.push(poolKeys.mintB.programId);
  // }

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

  // instructions.push(lookupTableInst);
  // instructions.push(extendInstruction);

  return instructions;
};

export const buyTokenInstructionPumpswap = async (
  poolKey: PublicKey,
  buyer: Keypair,
  buySolAmount: BN,
  slippage: number = 10,  // 1~100
) => {
  // Quote to Base swap (⬇️)
  const swapSolanaState = await pumpAmmSdk.swapSolanaState(poolKey, buyer.publicKey);
  const { globalConfig, pool, poolBaseAmount, poolQuoteAmount } = swapSolanaState;
  const quote = buySolAmount // maxSolCost.muln(100).divn(100 + slippage)

  const { base, maxQuote } = buyQuoteInputInternal(
    quote,
    slippage,
    poolBaseAmount,
    poolQuoteAmount,
    globalConfig,
    pool.coinCreator,
  );

  const swapInstructions = await pumpAmmInternalSdk.buyBaseInput(swapSolanaState, base, slippage)

  return { instructions: swapInstructions, minOut: base };
}

export const sellTokenInstructionPumpswap = async (
  poolKey: PublicKey,
  buyer: Keypair,
  baseAmount: BN,
  slippage: number = 10,  // 1~100
) => {
  // Base to Quote swap (⬆️)
  const swapSolanaState = await pumpAmmSdk.swapSolanaState(poolKey, buyer.publicKey);
  const { globalConfig, pool, poolBaseAmount, poolQuoteAmount } = swapSolanaState;

  const { minQuote } = sellBaseInputInternal(
    baseAmount,
    slippage,
    poolBaseAmount,
    poolQuoteAmount,
    globalConfig,
    pool.coinCreator,
  );

  const swapInstructions = await pumpAmmInternalSdk.sellBaseInput(swapSolanaState, baseAmount, slippage);

  return { instructions: swapInstructions, minOut: minQuote };
}