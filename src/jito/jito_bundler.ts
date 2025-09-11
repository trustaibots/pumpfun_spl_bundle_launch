
import { NORMAL_TIP } from "../config"
import { sleep } from "../solana/utils"

import { JITO_AUTH_KEYS } from "./const"
import { createAndSendBundleTransaction, JitoBundle } from "./jitoAPI"


const JITO_BLOCK_ENGINES = [
	"amsterdam.mainnet.block-engine.jito.wtf",
	"tokyo.mainnet.block-engine.jito.wtf",
	"frankfurt.mainnet.block-engine.jito.wtf",
	"ny.mainnet.block-engine.jito.wtf",
]

export class JitoBundler {
	private bundlers: any[] = []
	public constructor() {
		 for (let url of JITO_BLOCK_ENGINES) {
			  this.bundlers.push(new JitoBundle(url))
		 }
	}

	private getIdleBundle = async (): Promise<JitoBundle> => {
		 while (true) {
			  let randIdx = Math.floor(Math.random() * JITO_BLOCK_ENGINES.length)
			  if (!this.bundlers[randIdx].IsBusy()) {
				   return this.bundlers[randIdx]
			  }
			  await sleep(100)
		 }
	}

	private getJitoKey = (): string => {
		 return JITO_AUTH_KEYS[Math.floor(Math.random() * JITO_AUTH_KEYS.length)]
	}

	public sendRawBundles = async (bundleTransactions: any[], signers: any, payer: any, maxRetry: number = 3, sendBundle: boolean = false): Promise<boolean> => {
		const jitoBundle: JitoBundle = await this.getIdleBundle()
		const signedTxs = await jitoBundle.batchBundleSign(bundleTransactions, signers);
		return this.sendBundles(signedTxs, payer, maxRetry);
	}

	public sendBundles = async (bundleTransactions: any[], payer: any, maxRetry: number = 3): Promise<boolean> => {
		 let loop = 0
		 let result = false
		 while (loop < maxRetry && bundleTransactions && bundleTransactions.length > 0) {
			  const len: number = bundleTransactions.length
			  if (!bundleTransactions.length || bundleTransactions.length > 5) {
				   return false
			  }
			  const jitoBundle: JitoBundle = await this.getIdleBundle()

			  result = await jitoBundle.sendBundle(bundleTransactions, payer ? payer : null, this.getJitoKey(), NORMAL_TIP)
			  loop++
			  if (!result) {
				   await sleep(1000)
			  } else {
				   break;
			  }
		 }
		 return result
	}
}