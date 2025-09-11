import base58 from 'bs58';
import { searcherClient } from 'ts-jito/dist/sdk/block-engine/searcher';
import { Bundle } from 'ts-jito/dist/sdk/block-engine/types';

import {
	LAMPORTS_PER_SOL,
	PublicKey,
	SystemProgram,
	TransactionMessage,
	VersionedTransaction,
} from '@solana/web3.js';
import { connection } from '../const';
import { sleep } from '../solana/utils';
import { Keypair } from '@solana/web3.js';

export const getJitoTipAccount = () => {
	const tipAccounts = [
		"96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
		"HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
		"Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
		"ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
		"DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
		"ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
		"DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
		"3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"
	];
	// Randomly select one of the tip addresses
	const selectedTipAccount = tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
	return new PublicKey(selectedTipAccount);
};
import bs58 from 'bs58';
import axios from 'axios';

const DELAY_PER_REQ = 350
const MAX_REQ_COUNT = 4
const JITO_BUNDLE_LIMIT_SIZE = 5

export const createAndSendBundleTransaction = async (bundleTransactions: any, payer: any, apiKey: string, fee: number) => {
	const wallet = Keypair.fromSecretKey(bs58.decode(apiKey))
	const seacher = searcherClient(
		"frankfurt.mainnet.block-engine.jito.wtf",
		wallet
	);

	let transactionsConfirmResult: boolean = false
	let breakCheckTransactionStatus: boolean = false
	try {
		const recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
		let bundleTx = new Bundle(bundleTransactions, 5);
		if (payer) {
			const tipAccount = new PublicKey(getJitoTipAccount());
			bundleTx.addTipTx(payer, fee * LAMPORTS_PER_SOL, tipAccount, recentBlockhash);
		}

		seacher.onBundleResult(
			async (bundleResult: any) => {
				console.log(bundleResult);

				if (bundleResult.rejected) {
					try {
						if (bundleResult.rejected.simulationFailure.msg.includes("custom program error") ||
							bundleResult.rejected.simulationFailure.msg.includes("Error processing Instruction")) {
							breakCheckTransactionStatus = true
						}
						else if (bundleResult.rejected.simulationFailure.msg.includes("This transaction has already been processed") ||
							bundleResult.rejected.droppedBundle.msg.includes("Bundle partially processed")) {
							transactionsConfirmResult = true
							breakCheckTransactionStatus = true
						}
					} catch (error) {
						console.log(error);
					}
				}
			},
			(error: any) => {
				console.log(error);

				breakCheckTransactionStatus = true
			}
		);
		await seacher.sendBundle(bundleTx as any);
		setTimeout(() => { breakCheckTransactionStatus = true }, 20000)
		const trxHash = base58.encode(bundleTransactions[bundleTransactions.length - 1].signatures[0])
		console.log("trxHash", trxHash)
		while (!breakCheckTransactionStatus) {
			await sleep(1000)
			try {
				const result = await connection.getSignatureStatus(trxHash, {
					searchTransactionHistory: true,
				});
				if (result && result.value && result.value.confirmationStatus) {
					transactionsConfirmResult = true
					breakCheckTransactionStatus = true
				}
			} catch (error) {
				transactionsConfirmResult = false
				breakCheckTransactionStatus = true
			}
		}
		return transactionsConfirmResult
	} catch (error) {
		console.log(error);

		return false
	}
};

export class JitoBundle {
	private engineURL: string = ""
	private reqCount: number = 0
	constructor(blockengineURL: string) {
		this.engineURL = blockengineURL
		this.onIdle()
	}

	public IsBusy = () => {
		return this.reqCount >= MAX_REQ_COUNT
	}

	public checkBundle = async (uuid: any) => {
		let count = 0;
		while (1) {

			try {
				const { data: response } = await axios.post(
					`https://${this.engineURL}/api/v1/bundles?uuid=3c5ad750-303d-11f0-858a-6bee29fce9c1`,
					{
						jsonrpc: '2.0',
						id: 1,
						method: 'getBundleStatuses',
						params: [[uuid]],
					},
					{
						headers: {
							'Content-Type': 'application/json',
						},
						proxy: false,
						// timeout: 60000, // (optional) set timeout if needed
					}
				);
				console.log("Check Bundle Response:", response);
				if (response.result.value[0] !== undefined)
					console.log("bundle_id", response.result.value[0].bundle_id);

				if (response?.result?.value?.length == 1 && response?.result?.value[0]?.bundle_id) {
					console.log('✅ Bundle Success: Try Count:', count);
					// console.log('✅ Bundle Success:', uuid);
					return true;
				} else {
					console.log('❌ Bundle Failed');
				}

			} catch (error) {
				// console.log('❌ Check Bundle Failed', error);
				console.log('❌ Check Bundle Failed-Error', error);
			}

			await sleep(800);
			// console.log("retry-count:", count);
			count++;

			if (count === 5) {
				console.log('❌ Bundle Failed:', uuid);
				return false;
			}
		}
		return false;
	}

	public batchBundleSign = async (bundleTransactions: any[], signers: any[]): Promise<any[]> => {
		const searcher = searcherClient(
			"frankfurt.mainnet.block-engine.jito.wtf",
		);

		const result = await searcher.batchTransactionSign(bundleTransactions, signers);
		if (result.ok) {
			return result.value;
		} else {
			console.error("Batch transaction sign failed...", result.error);
			return [];
		}
	}

	public sendBundle = async (bundleTransactions: any[], feePayer: Keypair | null, key: string, fee: number): Promise<boolean> => {

		let transactionsConfirmResult: boolean = false
		let breakCheckTransactionStatus: boolean = false
		// console.log("Jito bundle transactions count:", bundleTransactions.length, feePayer ? "with fee payer" : "without fee payer");
		try {
			const recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
			let bundleTx: any[] = [...bundleTransactions];
			if (feePayer) {
				const transactionInstruction = SystemProgram.transfer({
					fromPubkey: feePayer.publicKey,
					toPubkey: new PublicKey(getJitoTipAccount()),
					lamports: Math.floor(fee * LAMPORTS_PER_SOL),
				})
				const tipTx = new VersionedTransaction(
					new TransactionMessage({
						payerKey: feePayer.publicKey,
						recentBlockhash: recentBlockhash,
						instructions: [transactionInstruction],
					}).compileToV0Message([])
				)
				tipTx.sign([feePayer])
				bundleTx.push(tipTx)
			}
			const rawTxns = bundleTx.map(item => base58.encode(item.serialize()));
			const { data: bundleRes } = await axios.post(
				`https://${this.engineURL}/api/v1/bundles?uuid=3c5ad750-303d-11f0-858a-6bee29fce9c1`,
				{
					jsonrpc: "2.0",
					id: 1,
					method: "sendBundle",
					params: [
						rawTxns
					],
				},
				{
					headers: {
						"Content-Type": "application/json",
					},
					proxy: false,
					// timeout: 60000,
				}
			);
			if (!bundleRes) {
				console.log ('Error fetching API');
				return false;
			}

			const bundleUUID = bundleRes.result;
			// console.log("Bundle sent.");
			console.log("Bundle UUID:", bundleUUID);

			// const res = await this.checkBundle(bundleUUID);

			const trxHash = base58.encode(bundleTransactions[bundleTransactions.length - 1].signatures[0])
			setTimeout(() => {
				breakCheckTransactionStatus = true
				console.log("Bundle sending timeout, check transaction status manually", trxHash)
			}, 20000)

			while (!breakCheckTransactionStatus) {
				await sleep(500)
				try {
					const result = await connection.getSignatureStatus(trxHash, {
						searchTransactionHistory: true,
					});
					if (result && result.value && result.value.confirmationStatus) {
						console.log("Transaction has been confirmed", trxHash)
						transactionsConfirmResult = true
						breakCheckTransactionStatus = true
					}
				} catch (error) {
					console.log("Transaction has been failed", trxHash)
					transactionsConfirmResult = false
					breakCheckTransactionStatus = true
				}
			}
			return transactionsConfirmResult
		} catch (error) {
			console.error("Creating and sending bundle failed...", error);
			return false
		}
	}

	private onIdle = async () => {
		if (this.reqCount) {
			this.reqCount--
		}

		setTimeout(() => { this.onIdle() }, DELAY_PER_REQ)
	}
}