import {CustomElement, InjectAppend, InjectionMode} from "../injectors";
import {Asset, UserSomeone} from "../../types/steam";
import {ItemHolderMetadata} from "../common/item_holder_metadata";

// Annotates item info (float, seed, etc...) in boxes on the Trade Offer Page
@CustomElement()
// Items when browsing their/your inventory
@InjectAppend('div.inventory_page:not([style*="display: none"]) .itemHolder div.app730', InjectionMode.CONTINUOUS)
// Items selected within the trade offer
@InjectAppend('.trade_offer .itemHolder div.app730', InjectionMode.CONTINUOUS)
export class TradeBoxMetadata extends ItemHolderMetadata {
    get owningUser(): UserSomeone|undefined {
        if (!this.assetId) return;

        if (UserThem && TradeBoxMetadata.getAssetFromUser(UserThem, this.assetId)) {
            return UserThem;
        } else if (UserYou && TradeBoxMetadata.getAssetFromUser(UserYou, this.assetId)) {
            return UserYou;
        }
    }

    get ownerSteamId(): string|undefined {
        if (!this.assetId) return;

        return this.owningUser?.strSteamId;
    }

    get asset(): Asset|undefined {
        if (!this.assetId) return;

        if (!this.owningUser) return;

        return TradeBoxMetadata.getAssetFromUser(this.owningUser, this.assetId);
    }

    private static getAssetFromUser(user: UserSomeone, assetId: string): Asset|undefined {
        if (user.rgContexts["730"]["2"].inventory?.rgInventory[assetId]) {
            const inventory = user.rgContexts["730"]["2"].inventory;
            return inventory?.rgInventory[assetId];
        }
    }
}
