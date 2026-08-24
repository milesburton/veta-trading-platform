import { useSignal } from "@preact/signals-react";
import { buildRoutingSankeyData } from "@veta/frontend/domain/orderRouting/sankeyData.ts";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import { COLOR } from "@veta/frontend/tokens.ts";
import type { Strategy } from "@veta/frontend/types.ts";
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from "recharts";

export function strategyColor(strategy: string): string {
  switch (strategy as Strategy) {
    case "LIMIT":
      return COLOR.LIMIT;
    case "TWAP":
      return COLOR.TWAP;
    case "POV":
      return COLOR.POV;
    case "VWAP":
      return COLOR.VWAP;
    case "ICEBERG":
      return COLOR.ICEBERG;
    case "SNIPER":
      return COLOR.SNIPER;
    case "ARRIVAL_PRICE":
      return COLOR.ARRIVAL_PRICE;
    case "IS":
      return COLOR.IS;
    case "MOMENTUM":
      return COLOR.MOMENTUM;
    default:
      return COLOR.NEUTRAL;
  }
}

interface NodePayload {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: { name: string; isStrategy: boolean };
}

function SankeyNodeShape({ x, y, width, height, payload }: NodePayload) {
  const fill = payload.isStrategy ? strategyColor(payload.name) : COLOR.CHART_AXIS;
  const labelX = payload.isStrategy ? x - 6 : x + width + 6;
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.9} />
      <text
        x={labelX}
        y={y + height / 2}
        dy={3}
        textAnchor={payload.isStrategy ? "end" : "start"}
        fill={COLOR.CHART_AXIS}
        fontSize={10}
      >
        {payload.name}
      </text>
    </Layer>
  );
}

interface LinkPayload {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourceControlX: number;
  targetControlX: number;
  linkWidth: number;
  payload: { source: { name: string }; value: number };
}

function SankeyLinkShape({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceControlX,
  targetControlX,
  linkWidth,
  payload,
}: LinkPayload) {
  const color = strategyColor(payload.source.name);
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={color}
      strokeOpacity={0.35}
      strokeWidth={Math.max(1, linkWidth)}
    />
  );
}

export function OrderRoutingSankeyPanel() {
  const showTable = useSignal(false);
  const orders = useAppSelector((s) => s.orders.orders);
  const data = buildRoutingSankeyData(orders);
  const hasFlow = data.links.length > 0;

  return (
    <div className="flex flex-col h-full bg-page text-default text-xs">
      <div className="px-4 py-2.5 border-b border-panel shrink-0 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          Order Routing Flow
        </span>
        <button
          type="button"
          onClick={() => {
            showTable.value = !showTable.value;
          }}
          className="text-[10px] text-muted hover:text-secondary transition-colors"
          data-testid="toggle-table-view"
        >
          {showTable.value ? "Show diagram" : "Show table"}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        {!hasFlow ? (
          <div className="flex h-full items-center justify-center text-divider text-[11px]">
            No filled child orders yet
          </div>
        ) : showTable.value ? (
          <table className="w-full text-[11px]" data-testid="routing-table">
            <thead>
              <tr className="text-left text-muted border-b border-panel">
                <th className="py-1 pr-3 font-medium">Strategy</th>
                <th className="py-1 pr-3 font-medium">Venue</th>
                <th className="py-1 text-right font-medium">Filled qty</th>
              </tr>
            </thead>
            <tbody>
              {data.links.map((link) => {
                const strategyName = data.nodes[link.source]?.name ?? "";
                const venueName = data.nodes[link.target]?.name ?? "";
                return (
                  <tr key={`${strategyName}-${venueName}`} className="border-b border-panel/40">
                    <td className="py-1 pr-3">
                      <span style={{ color: strategyColor(strategyName) }}>{strategyName}</span>
                    </td>
                    <td className="py-1 pr-3 text-secondary">{venueName}</td>
                    <td className="py-1 text-right tabular-nums text-default">
                      {link.value.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minHeight={Math.max(320, data.nodes.length * 46)}
          >
            <Sankey
              data={data}
              node={SankeyNodeShape as never}
              link={SankeyLinkShape as never}
              nodePadding={28}
              nodeWidth={10}
              margin={{ top: 8, right: 48, bottom: 8, left: 64 }}
            >
              <Tooltip
                contentStyle={{
                  background: COLOR.CHART_TOOLTIP_BG,
                  border: `1px solid ${COLOR.CHART_TOOLTIP_BORDER}`,
                  fontSize: 10,
                }}
                formatter={(value: unknown) => [Number(value).toLocaleString(), "Filled qty"]}
              />
            </Sankey>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
