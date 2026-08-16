// FIX 4.4 tag constants and message type values
// Ref: https://fixprotocol.org/specifications/fix44

export const Tag = {
  BeginString: 8,
  BodyLength: 9,
  MsgType: 35,
  SenderCompID: 49,
  TargetCompID: 56,
  MsgSeqNum: 34,
  SendingTime: 52,

  HeartBtInt: 108,
  EncryptMethod: 98,
  TestReqID: 112,
  GapFillFlag: 123,
  NewSeqNo: 36,
  BeginSeqNo: 7,
  EndSeqNo: 16,
  ResetSeqNumFlag: 141,
  RefSeqNum: 45,
  RefMsgType: 372,
  SessionRejectReason: 373,

  ClOrdID: 11,
  OrigClOrdID: 41,
  CxlRejReason: 102,
  CxlRejResponseTo: 434,
  Symbol: 55,
  Side: 54,
  OrderQty: 38,
  Price: 44,
  OrdType: 40,
  TimeInForce: 59,
  TransactTime: 60,
  ExDestination: 100,
  HandlInst: 21,
  Account: 1,

  ExecID: 17,
  ExecType: 150,
  OrdStatus: 39,
  LeavesQty: 151,
  CumQty: 14,
  AvgPx: 6,
  OrderID: 37,
  LastQty: 32,
  LastPx: 31,

  Text: 58,
  CheckSum: 10,
} as const;

export type TagKey = keyof typeof Tag;

export const MsgType = {
  Heartbeat: "0",
  TestRequest: "1",
  ResendRequest: "2",
  Reject: "3",
  SequenceReset: "4",
  Logout: "5",
  Logon: "A",
  NewOrderSingle: "D",
  ExecutionReport: "8",
  OrderCancelRequest: "F",
  OrderCancelReplaceRequest: "G",
  OrderCancelReject: "9",
} as const;

export type MsgTypeValue = (typeof MsgType)[keyof typeof MsgType];

// CxlRejResponseTo (tag 434): identifies which cancel-family message an
// OrderCancelReject is responding to.
export const CxlRejResponseTo = {
  OrderCancelRequest: "1",
  OrderCancelReplaceRequest: "2",
} as const;

// CxlRejReason (tag 102): a small subset of the FIX 4.4 enum, limited to
// the reasons this exchange can actually produce.
export const CxlRejReason = {
  UnknownOrder: "1",
  TooLateToCancel: "0",
  Other: "99",
} as const;

export const Side = {
  Buy: "1",
  Sell: "2",
} as const;

export const OrdType = {
  Market: "1",
  Limit: "2",
} as const;

export const OrdStatus = {
  New: "0",
  PartiallyFilled: "1",
  Filled: "2",
  Canceled: "4",
  Rejected: "8",
} as const;

export const ExecType = {
  New: "0",
  PartialFill: "1",
  Fill: "F",
  Canceled: "4",
  Rejected: "8",
  Trade: "F",
} as const;

export const TimeInForce = {
  Day: "0",
  GoodTillCancel: "1",
  ImmediateOrCancel: "3",
  FillOrKill: "4",
} as const;

export const EncryptMethod = {
  None: "0",
} as const;
