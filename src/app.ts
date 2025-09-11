import * as db from "./db";
import { launchPumpFun, launchPumpFunAndSnipe, sellAllPumpFunToken, sellAllPumpSwapToken, SnipeToken } from "./engine";
import {
    checkWalletBalances,
    collectFunds,
    exportLaunchConfig,
    fundWalletsFromHostWallet,
    fundWalletsFromMEXC,
    fundWalletsFromWallets,
    loadLaunchConfig,
    prepareLaunchConfig,
    showLaunchConfig,
} from "./launch-config";
import promptSync from "prompt-sync";
import { sleep } from "./solana/utils";
import { BUNDLE_BUY_SOL, BUNDLE_BUY_WALLET_COUNT } from "./config";

const prompt = promptSync({ sigint: true });

async function main() {
    await db.init();

    let running = true;

    while (running) {
        console.log(
            `\n👋 Welcome to the Solana Pump Fun Launch Script\n\nMenu:`
        );

        console.log(` 1. Prepare Launch Config (Create wallets)`);
        console.log(` 2. Fund wallets from MEXC`);
        console.log(` 3. Fund wallets from host wallet`);
        console.log(` 4. Fund wallets from wallets`);
        console.log(` 5. Launch Pump Fun Token (Only Launch, No Snipe)`);
        console.log(` 6. Snipe Tokens (Only Bundle, No Launch)`);
        console.log(` 7. Launch and Snipe Token (Launch & Snipe)`);
        console.log(` 8. Sell all Pump Fun Token`);
        console.log(` 9. Sell all Pump Swap Token`);
        console.log(` C. Collect funds`);
        console.log(` B. Check Wallet Balances`);
        console.log(` S. Show Launch Config`);
        console.log(` E. Export Launch Config`);
        console.log(` Q. Exit`);
        const answer = prompt("\nPlease choose an option: "); // Use prompt-sync for user input

        try {
            const launchConfig = await loadLaunchConfig();
            if (!launchConfig) {
                console.log("❌ Failed to load launch config");
                continue;
            }

            switch (answer) {
                case "1":
                    await prepareLaunchConfig(BUNDLE_BUY_WALLET_COUNT, BUNDLE_BUY_SOL);
                    break;
                case "2":
                    {
                        console.log("Funding wallets from MEXC...");
                        await fundWalletsFromMEXC(launchConfig);
                    }
                    break;
                case "3":
                    {
                        console.log("Funding wallets from host wallet...");
                        await fundWalletsFromHostWallet(launchConfig);
                    }
                    break;
                case "4":
                    {
                        console.log("Funding wallets...");
                        await fundWalletsFromWallets(launchConfig);
                    }
                    break;
                case "5":
                    {
                        await launchPumpFun(launchConfig);
                    }
                    break;
                case "6":
                    {
                        await SnipeToken(launchConfig);
                    }
                    break;
                case "7":
                    {
                        await launchPumpFunAndSnipe(launchConfig);
                    }
                    break;
                case "8":
                    {
                        await sellAllPumpFunToken(launchConfig);
                    }
                    break;
                case "9":
                    {
                        await sellAllPumpSwapToken(launchConfig);
                    }
                    break;
                case "C":
                case "c":
                    {
                        await collectFunds(launchConfig);
                    }
                    break;
                case "b":
                case "B":
                    {
                        await checkWalletBalances(launchConfig);
                    }
                    break;
                case "S":
                case "s":
                    {
                        await showLaunchConfig(launchConfig);
                    }
                    break;
                case "e":
                case "E":
                    {
                        console.log("Exporting launch config...");
                        await exportLaunchConfig(launchConfig);
                    }
                    break;
                case "q":
                case "Q":
                    running = false;
                    break;
                default:
                    console.log("Invalid option, please choose again.");
            }
        } catch (error) {
            console.log(error);
        }
    }

    console.log("Closing...");
    process.exit(0);
}

main();
