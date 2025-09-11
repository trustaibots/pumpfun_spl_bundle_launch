import Spot from "../../../pumpfun-launch-bot/src/mexc/spot";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.API_KEY ?? "";
const API_SECRET = process.env.API_SECRET ?? "";
const SOL_WITHDRAW_FEE = 0;

let SPOT = new Spot(API_KEY, API_SECRET, { baseURL: "https://api.mexc.com" });

export const solWithdraw = async (address = "", amount = 0.1) => {
    if (!address || address === "") return;

    SPOT.logger.log(`Withdrawing ${amount} SOL to ${address} from MEXC`);
    try {
        const response = await SPOT.WithDraw({
            coin: "SOL",
            address: address,
            amount: amount + SOL_WITHDRAW_FEE,
            network: "Solana(SOL)",
        });
        return true;
    } catch (error) {
        SPOT.logger.error(error);
        return false;
    }

    return false;
};