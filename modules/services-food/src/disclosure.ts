import type {Data} from '@steward/business-kit';
/** Counts stock resources below their explicit threshold, never recipients.
 * External resources are outside this expressly local metric; local observations after cutoff stay unknown. */
export function observedSupplyShortages(stocks:Data[],deliveries:Data[],periodEnd:string):number|null{
 const cutoff=Date.parse(periodEnd);if(!Number.isFinite(cutoff))return null;let shortages=0;
 for(const stock of stocks){if(Date.parse(stock.createdAt)>=cutoff)continue;if(stock.mode!=='local')continue;if(!Number.isFinite(Date.parse(stock.createdAt))||!Number.isFinite(Date.parse(stock.quantityObservedAt))||Date.parse(stock.quantityObservedAt)>=cutoff)return null;
  let used=0;for(const d of deliveries.filter(d=>d.stockId===stock.id&&d.status==='delivered')){const at=Date.parse(d.deliveredAt);if(!Number.isFinite(at))return null;if(at<cutoff)used+=d.stockQuantity;}
  if(stock.quantity-used<stock.minStock)shortages++;
 }
 return shortages;
}

