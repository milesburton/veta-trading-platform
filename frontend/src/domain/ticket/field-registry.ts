export type FieldKind =
  | "side"
  | "quantity"
  | "price"
  | "symbol"
  | "strategy"
  | "venue"
  | "tif"
  | "duration"
  | "optionType"
  | "strike"
  | "expiry"
  | "bondSymbol"
  | "yield";

export type FieldSection = "order" | "routing" | "strategy-params" | "risk" | "instrument";

export interface FieldDefinition {
  key: string;
  kind: FieldKind;
  label: string;
  section: FieldSection;
  defaultRequired: boolean;
  defaultVisible: boolean;
}

export const FK = {
  SIDE: "side",
  SYMBOL: "symbol",
  QUANTITY: "quantity",
  LIMIT_PRICE: "limitPrice",
  STRATEGY: "strategy",
  VENUE: "venue",
  TIF: "tif",
  EXPIRES_AT: "expiresAtSecs",
  OPTION_TYPE: "optionType",
  STRIKE: "strike",
  EXPIRY: "expiry",
  BOND_SYMBOL: "bondSymbol",
  YIELD_PCT: "yieldPct",
} as const;

export const FIELD_REGISTRY: FieldDefinition[] = [
  {
    key: FK.SIDE,
    kind: "side",
    label: "Side",
    section: "order",
    defaultRequired: true,
    defaultVisible: true,
  },
  {
    key: FK.SYMBOL,
    kind: "symbol",
    label: "Symbol",
    section: "order",
    defaultRequired: true,
    defaultVisible: true,
  },
  {
    key: FK.QUANTITY,
    kind: "quantity",
    label: "Quantity",
    section: "order",
    defaultRequired: true,
    defaultVisible: true,
  },
  {
    key: FK.LIMIT_PRICE,
    kind: "price",
    label: "Limit Price",
    section: "order",
    defaultRequired: true,
    defaultVisible: true,
  },
  {
    key: FK.STRATEGY,
    kind: "strategy",
    label: "Strategy",
    section: "order",
    defaultRequired: true,
    defaultVisible: true,
  },
  {
    key: FK.VENUE,
    kind: "venue",
    label: "Venue",
    section: "routing",
    defaultRequired: false,
    defaultVisible: true,
  },
  {
    key: FK.TIF,
    kind: "tif",
    label: "Time in Force",
    section: "routing",
    defaultRequired: true,
    defaultVisible: true,
  },
  {
    key: FK.EXPIRES_AT,
    kind: "duration",
    label: "Duration",
    section: "routing",
    defaultRequired: true,
    defaultVisible: true,
  },
  {
    key: FK.OPTION_TYPE,
    kind: "optionType",
    label: "Option Type",
    section: "instrument",
    defaultRequired: false,
    defaultVisible: false,
  },
  {
    key: FK.STRIKE,
    kind: "strike",
    label: "Strike Price",
    section: "instrument",
    defaultRequired: false,
    defaultVisible: false,
  },
  {
    key: FK.EXPIRY,
    kind: "expiry",
    label: "Expiry",
    section: "instrument",
    defaultRequired: false,
    defaultVisible: false,
  },
  {
    key: FK.BOND_SYMBOL,
    kind: "bondSymbol",
    label: "Bond",
    section: "instrument",
    defaultRequired: false,
    defaultVisible: false,
  },
  {
    key: FK.YIELD_PCT,
    kind: "yield",
    label: "Yield",
    section: "instrument",
    defaultRequired: false,
    defaultVisible: false,
  },
];

export function getFieldDef(key: string): FieldDefinition | undefined {
  return FIELD_REGISTRY.find((f) => f.key === key);
}

export type FieldKey = (typeof FIELD_REGISTRY)[number]["key"];
