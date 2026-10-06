import type { OrderBookSnapshot } from "@veta/market-client";
import { VENUES, type VenueMIC } from "./fill-math.ts";
import { type MatchAgainstSnapshotResult, matchAgainstSnapshot } from "./matching-engine.ts";

export const ALL_VENUES: readonly VenueMIC[] = VENUES.map((v) => v.mic);

export interface VenueRoute {
  venue: VenueMIC;
  match: MatchAgainstSnapshotResult;
}

export interface RouteRequest {
  childId: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  venueBooks: Record<string, Record<string, OrderBookSnapshot>> | undefined;
  candidates: readonly VenueMIC[];
  now: number;
}

function hasDepth(snapshot: OrderBookSnapshot | undefined): snapshot is OrderBookSnapshot {
  return snapshot !== undefined && (snapshot.bids.length > 0 || snapshot.asks.length > 0);
}

function isBetter(side: "BUY" | "SELL", candidate: VenueRoute, best: VenueRoute): boolean {
  if (candidate.match.filledQty !== best.match.filledQty) {
    return candidate.match.filledQty > best.match.filledQty;
  }
  const candidatePrice = candidate.match.avgFillPrice;
  const bestPrice = best.match.avgFillPrice;
  if (candidatePrice === undefined || bestPrice === undefined) return false;
  return side === "BUY" ? candidatePrice < bestPrice : candidatePrice > bestPrice;
}

export function routeToBestVenue(request: RouteRequest): VenueRoute | null {
  const routes = request.candidates.flatMap((venue): VenueRoute[] => {
    const snapshot = request.venueBooks?.[venue]?.[request.asset];
    if (!hasDepth(snapshot)) return [];
    const match = matchAgainstSnapshot(
      request.childId,
      request.asset,
      request.side,
      request.quantity,
      request.limitPrice,
      snapshot,
      request.now
    );
    return [{ venue, match }];
  });
  return routes.reduce<VenueRoute | null>(
    (best, route) => (best === null || isBetter(request.side, route, best) ? route : best),
    null
  );
}
