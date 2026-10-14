import { assertEquals } from "jsr:@std/assert@0.217";
import {
  addOrder,
  bestAsk,
  bestBid,
  cancelOrder,
  createBook,
  matchOrder,
  type RestingOrder,
} from "../ems/order-book.ts";

function order(overrides: Partial<RestingOrder>): RestingOrder {
  return {
    orderId: "O1",
    asset: "AAPL",
    side: "BUY",
    price: 100,
    quantity: 10,
    remainingQty: 10,
    enteredAt: 0,
    seq: 0,
    ...overrides,
  };
}

Deno.test("[order-book] resting bid becomes the best bid", () => {
  const book = addOrder(createBook("AAPL"), order({ orderId: "B1", side: "BUY", price: 99 }));
  assertEquals(bestBid(book), 99);
  assertEquals(bestAsk(book), undefined);
});

Deno.test("[order-book] higher-priced bid ranks ahead of a lower-priced bid", () => {
  let book = createBook("AAPL");
  book = addOrder(book, order({ orderId: "B1", side: "BUY", price: 99, seq: 0 }));
  book = addOrder(book, order({ orderId: "B2", side: "BUY", price: 101, seq: 1 }));
  assertEquals(bestBid(book), 101);
  assertEquals(book.bids[0].orderId, "B2");
});

Deno.test("[order-book] equal-priced bids keep price-time priority (earlier seq first)", () => {
  let book = createBook("AAPL");
  book = addOrder(book, order({ orderId: "B1", side: "BUY", price: 100, seq: 0 }));
  book = addOrder(book, order({ orderId: "B2", side: "BUY", price: 100, seq: 1 }));
  assertEquals(book.bids[0].orderId, "B1");
  assertEquals(book.bids[1].orderId, "B2");
});

Deno.test("[order-book] cancel removes the order from whichever side holds it", () => {
  let book = createBook("AAPL");
  book = addOrder(book, order({ orderId: "B1", side: "BUY", price: 100 }));
  book = addOrder(book, order({ orderId: "S1", side: "SELL", price: 101 }));
  book = cancelOrder(book, "B1");
  assertEquals(book.bids.length, 0);
  assertEquals(book.asks.length, 1);
});

Deno.test("[order-book] marketable buy fully matches a resting ask at the ask's price", () => {
  let book = createBook("AAPL");
  book = addOrder(book, order({ orderId: "S1", side: "SELL", price: 100, quantity: 10, remainingQty: 10 }));

  const result = matchOrder(
    book,
    order({ orderId: "B1", side: "BUY", price: 100, quantity: 10, remainingQty: 10 }),
    1_000,
    true
  );

  assertEquals(result.filledQty, 10);
  assertEquals(result.remainingQty, 0);
  assertEquals(result.fills.length, 1);
  assertEquals(result.fills[0].price, 100);
  assertEquals(result.fills[0].restingOrderId, "S1");
  assertEquals(result.book.asks.length, 0);
  assertEquals(result.book.bids.length, 0);
});

Deno.test("[order-book] partial fill leaves remainder resting when restRemainder is true", () => {
  let book = createBook("AAPL");
  book = addOrder(book, order({ orderId: "S1", side: "SELL", price: 100, quantity: 4, remainingQty: 4 }));

  const result = matchOrder(
    book,
    order({ orderId: "B1", side: "BUY", price: 100, quantity: 10, remainingQty: 10 }),
    1_000,
    true
  );

  assertEquals(result.filledQty, 4);
  assertEquals(result.remainingQty, 6);
  assertEquals(result.book.asks.length, 0);
  assertEquals(result.book.bids.length, 1);
  assertEquals(result.book.bids[0].remainingQty, 6);
});

Deno.test("[order-book] partial fill remainder is dropped when restRemainder is false", () => {
  let book = createBook("AAPL");
  book = addOrder(book, order({ orderId: "S1", side: "SELL", price: 100, quantity: 4, remainingQty: 4 }));

  const result = matchOrder(
    book,
    order({ orderId: "B1", side: "BUY", price: 100, quantity: 10, remainingQty: 10 }),
    1_000,
    false
  );

  assertEquals(result.filledQty, 4);
  assertEquals(result.remainingQty, 6);
  assertEquals(result.book.bids.length, 0);
});

Deno.test("[order-book] no-fill when incoming price does not cross the book", () => {
  let book = createBook("AAPL");
  book = addOrder(book, order({ orderId: "S1", side: "SELL", price: 105, quantity: 10, remainingQty: 10 }));

  const result = matchOrder(
    book,
    order({ orderId: "B1", side: "BUY", price: 100, quantity: 10, remainingQty: 10 }),
    1_000,
    true
  );

  assertEquals(result.filledQty, 0);
  assertEquals(result.remainingQty, 10);
  assertEquals(result.fills.length, 0);
  assertEquals(result.book.asks.length, 1);
  assertEquals(result.book.bids.length, 1);
});

Deno.test("[order-book] incoming order walks the book across multiple price levels in price priority", () => {
  let book = createBook("AAPL");
  book = addOrder(book, order({ orderId: "S1", side: "SELL", price: 101, quantity: 5, remainingQty: 5, seq: 0 }));
  book = addOrder(book, order({ orderId: "S2", side: "SELL", price: 100, quantity: 5, remainingQty: 5, seq: 1 }));

  const result = matchOrder(
    book,
    order({ orderId: "B1", side: "BUY", price: 101, quantity: 8, remainingQty: 8 }),
    1_000,
    true
  );

  assertEquals(result.filledQty, 8);
  assertEquals(result.fills[0].restingOrderId, "S2");
  assertEquals(result.fills[0].price, 100);
  assertEquals(result.fills[0].matchedQty, 5);
  assertEquals(result.fills[1].restingOrderId, "S1");
  assertEquals(result.fills[1].matchedQty, 3);
  assertEquals(result.book.asks.length, 1);
  assertEquals(result.book.asks[0].remainingQty, 2);
});

Deno.test("[order-book] two competing buys against one resting ask fill in time priority, second buy partially unfilled", () => {
  let book = createBook("AAPL");
  book = addOrder(book, order({ orderId: "S1", side: "SELL", price: 100, quantity: 6, remainingQty: 6 }));

  const first = matchOrder(
    book,
    order({ orderId: "B1", side: "BUY", price: 100, quantity: 4, remainingQty: 4 }),
    1_000,
    true
  );
  const second = matchOrder(
    first.book,
    order({ orderId: "B2", side: "BUY", price: 100, quantity: 4, remainingQty: 4 }),
    1_001,
    true
  );

  assertEquals(first.filledQty, 4);
  assertEquals(second.filledQty, 2);
  assertEquals(second.remainingQty, 2);
  assertEquals(second.book.asks.length, 0);
  assertEquals(second.book.bids.length, 1);
  assertEquals(second.book.bids[0].orderId, "B2");
});
