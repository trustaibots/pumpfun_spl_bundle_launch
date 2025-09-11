
import {
    Connection, 
    Transaction, 
    ComputeBudgetProgram
} from '@solana/web3.js';

import { RPC_URL } from "../const";

const QUERY_RPC_URL = RPC_URL

interface EstimatePriorityFeesParams {
    // (Optional) The number of blocks to consider for the fee estimate
    last_n_blocks?: number;
    // (Optional) The program account to use for fetching the local estimate (e.g., Jupiter: JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4)
    account?: string;
    // Your Add-on Endpoint (found in your QuickNode Dashboard - https://dashboard.quicknode.com/endpoints)
    endpoint: string;
};

interface RequestPayload {
    method: string;
    params: {
        last_n_blocks: number;
        account: string;
    };
    id: number;
    jsonrpc: string;
};


const params: EstimatePriorityFeesParams = {
    last_n_blocks: 100,
    account: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    endpoint: QUERY_RPC_URL
};


const fetchEstimatePriorityFees = async (estimateParams: EstimatePriorityFeesParams) => {
    let params = {
        last_n_blocks: 0,
        account: ''
    };

    if (estimateParams.last_n_blocks !== undefined) {
        params.last_n_blocks = estimateParams.last_n_blocks;
    }
    if (estimateParams.account !== undefined) {
        params.account = estimateParams.account;
    }

    const payload: RequestPayload = {
        method: 'qn_estimatePriorityFees',
        params,
        id: 1,
        jsonrpc: '2.0',
    };

    const response = await fetch(estimateParams.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
};

const getDynamicPriorityFee = async () => {
    const { result } = await fetchEstimatePriorityFees(params);
    const priorityFee = result.per_compute_unit.high /* extreme */;
    return priorityFee;
};

const getComputeUnitsForTransaction = async (connection: Connection, tx: Transaction) => {
    try {
        const newTx = new Transaction();

        newTx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }));
        newTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
        newTx.add(...tx.instructions);
        newTx.recentBlockhash = tx.recentBlockhash;
        newTx.lastValidBlockHeight = tx.lastValidBlockHeight;
        newTx.feePayer = tx.feePayer;

        const simulation = await connection.simulateTransaction(newTx);
        if (simulation.value.err) {
            console.log('simulation.value.err:', simulation.value.err);
            return 0;
        }

        return simulation.value.unitsConsumed ?? 200_000;
    } catch (e) {
        console.log(e);
        return 0
    }
};

export const getOptimalPriceAndBudget = async (connection: Connection, hydratedTransaction: Transaction) => {
    const [priorityFee, computeUnits] = await Promise.all([
        getDynamicPriorityFee(),
        getComputeUnitsForTransaction(connection, hydratedTransaction)
    ]);
    return [priorityFee, computeUnits];
};
