import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { StrategyParams } from "../StrategyParams";

const defaultProps = {
  activeStrategy: "LIMIT",
  twapSlices: "10",
  setTwapSlices: vi.fn(),
  twapCap: "25",
  setTwapCap: vi.fn(),
  povRate: "10",
  setPovRate: vi.fn(),
  povMin: "10",
  setPovMin: vi.fn(),
  povMax: "500",
  setPovMax: vi.fn(),
  vwapDev: "0.5",
  setVwapDev: vi.fn(),
  vwapStart: "0",
  setVwapStart: vi.fn(),
  vwapEnd: "300",
  setVwapEnd: vi.fn(),
  icebergVisible: "100",
  setIcebergVisible: vi.fn(),
  sniperAggression: "80",
  setSniperAggression: vi.fn(),
  sniperMaxVenues: "2",
  setSniperMaxVenues: vi.fn(),
  apUrgency: "50",
  setApUrgency: vi.fn(),
  apMaxSlippageBps: "30",
  setApMaxSlippageBps: vi.fn(),
  isUrgency: "50",
  setIsUrgency: vi.fn(),
  isMaxSlippageBps: "30",
  setIsMaxSlippageBps: vi.fn(),
  isMinSlices: "3",
  setIsMinSlices: vi.fn(),
  isMaxSlices: "10",
  setIsMaxSlices: vi.fn(),
  momentumThreshold: "20",
  setMomentumThreshold: vi.fn(),
  momentumMaxTranches: "5",
  setMomentumMaxTranches: vi.fn(),
  momentumShortEma: "5",
  setMomentumShortEma: vi.fn(),
  momentumLongEma: "20",
  setMomentumLongEma: vi.fn(),
  momentumCooldown: "3",
  setMomentumCooldown: vi.fn(),
};

test("renders nothing when strategy is LIMIT", () => {
  const { container } = render(<StrategyParams {...defaultProps} activeStrategy="LIMIT" />);
  expect(container.firstChild).toBeNull();
});

test("renders twap params when TWAP active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="TWAP" />);
  expect(screen.getByLabelText(/Slices/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Part. Cap %/)).toBeInTheDocument();
  expect(screen.getByText(/TWAP Params/i)).toBeInTheDocument();
});

test("calls setTwapSlices when TWAP slices input changes", () => {
  const setTwapSlices = vi.fn();
  render(<StrategyParams {...defaultProps} activeStrategy="TWAP" setTwapSlices={setTwapSlices} />);
  fireEvent.change(screen.getByLabelText(/Slices/), { target: { value: "5" } });
  expect(setTwapSlices).toHaveBeenCalledWith("5");
});

test("calls setTwapCap when TWAP cap input changes", () => {
  const setTwapCap = vi.fn();
  render(<StrategyParams {...defaultProps} activeStrategy="TWAP" setTwapCap={setTwapCap} />);
  fireEvent.change(screen.getByLabelText(/Part. Cap %/), {
    target: { value: "50" },
  });
  expect(setTwapCap).toHaveBeenCalledWith("50");
});

test("renders POV params when POV active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="POV" />);
  expect(screen.getByLabelText(/Participation Rate %/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Min Slice/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Max Slice/)).toBeInTheDocument();
  expect(screen.getByText(/POV Params/i)).toBeInTheDocument();
});

test("calls setPovRate when POV rate input changes", () => {
  const setPovRate = vi.fn();
  render(<StrategyParams {...defaultProps} activeStrategy="POV" setPovRate={setPovRate} />);
  fireEvent.change(screen.getByLabelText(/Participation Rate %/), {
    target: { value: "20" },
  });
  expect(setPovRate).toHaveBeenCalledWith("20");
});

test("calls setPovMin and setPovMax when POV slice inputs change", () => {
  const setPovMin = vi.fn();
  const setPovMax = vi.fn();
  render(
    <StrategyParams
      {...defaultProps}
      activeStrategy="POV"
      setPovMin={setPovMin}
      setPovMax={setPovMax}
    />
  );
  fireEvent.change(screen.getByLabelText(/Min Slice/), {
    target: { value: "5" },
  });
  fireEvent.change(screen.getByLabelText(/Max Slice/), {
    target: { value: "1000" },
  });
  expect(setPovMin).toHaveBeenCalledWith("5");
  expect(setPovMax).toHaveBeenCalledWith("1000");
});

test("renders VWAP params when VWAP active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="VWAP" />);
  expect(screen.getByLabelText(/Max Deviation %/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Start Offset/)).toBeInTheDocument();
  expect(screen.getByLabelText(/End Offset/)).toBeInTheDocument();
  expect(screen.getByText(/VWAP Params/i)).toBeInTheDocument();
});

test("calls setVwapDev when VWAP deviation input changes", () => {
  const setVwapDev = vi.fn();
  render(<StrategyParams {...defaultProps} activeStrategy="VWAP" setVwapDev={setVwapDev} />);
  fireEvent.change(screen.getByLabelText(/Max Deviation %/), {
    target: { value: "1.0" },
  });
  expect(setVwapDev).toHaveBeenCalledWith("1.0");
});

test("calls setVwapStart and setVwapEnd when VWAP offset inputs change", () => {
  const setVwapStart = vi.fn();
  const setVwapEnd = vi.fn();
  render(
    <StrategyParams
      {...defaultProps}
      activeStrategy="VWAP"
      setVwapStart={setVwapStart}
      setVwapEnd={setVwapEnd}
    />
  );
  fireEvent.change(screen.getByLabelText(/Start Offset/), {
    target: { value: "10" },
  });
  fireEvent.change(screen.getByLabelText(/End Offset/), {
    target: { value: "600" },
  });
  expect(setVwapStart).toHaveBeenCalledWith("10");
  expect(setVwapEnd).toHaveBeenCalledWith("600");
});

test("does not render TWAP or POV content when VWAP is active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="VWAP" />);
  expect(screen.queryByText(/TWAP Params/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/POV Params/i)).not.toBeInTheDocument();
});

test("renders ICEBERG params when ICEBERG active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="ICEBERG" />);
  expect(screen.getByLabelText(/Visible Qty/)).toBeInTheDocument();
  expect(screen.getByText(/ICEBERG Params/i)).toBeInTheDocument();
});

test("calls setIcebergVisible when visible qty input changes", () => {
  const setIcebergVisible = vi.fn();
  render(
    <StrategyParams
      {...defaultProps}
      activeStrategy="ICEBERG"
      setIcebergVisible={setIcebergVisible}
    />
  );
  fireEvent.change(screen.getByLabelText(/Visible Qty/), {
    target: { value: "50" },
  });
  expect(setIcebergVisible).toHaveBeenCalledWith("50");
});

test("does not render other strategy content when ICEBERG is active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="ICEBERG" />);
  expect(screen.queryByText(/TWAP Params/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/POV Params/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/VWAP Params/i)).not.toBeInTheDocument();
});

test("renders SNIPER params when SNIPER active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="SNIPER" />);
  expect(screen.getByLabelText(/Aggression %/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Max Venues/)).toBeInTheDocument();
  expect(screen.getByText(/SNIPER Params/i)).toBeInTheDocument();
});

test("calls setSniperAggression when aggression input changes", () => {
  const setSniperAggression = vi.fn();
  render(
    <StrategyParams
      {...defaultProps}
      activeStrategy="SNIPER"
      setSniperAggression={setSniperAggression}
    />
  );
  fireEvent.change(screen.getByLabelText(/Aggression %/), {
    target: { value: "60" },
  });
  expect(setSniperAggression).toHaveBeenCalledWith("60");
});

test("calls setSniperMaxVenues when max venues input changes", () => {
  const setSniperMaxVenues = vi.fn();
  render(
    <StrategyParams
      {...defaultProps}
      activeStrategy="SNIPER"
      setSniperMaxVenues={setSniperMaxVenues}
    />
  );
  fireEvent.change(screen.getByLabelText(/Max Venues/), {
    target: { value: "3" },
  });
  expect(setSniperMaxVenues).toHaveBeenCalledWith("3");
});

test("renders ARRIVAL_PRICE params when ARRIVAL_PRICE active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="ARRIVAL_PRICE" />);
  expect(screen.getByLabelText(/Urgency/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Max Slippage Bps/)).toBeInTheDocument();
  expect(screen.getByText(/ARRIVAL PRICE Params/i)).toBeInTheDocument();
});

test("calls setApUrgency when urgency input changes", () => {
  const setApUrgency = vi.fn();
  render(
    <StrategyParams {...defaultProps} activeStrategy="ARRIVAL_PRICE" setApUrgency={setApUrgency} />
  );
  fireEvent.change(screen.getByLabelText(/Urgency/), {
    target: { value: "75" },
  });
  expect(setApUrgency).toHaveBeenCalledWith("75");
});

test("calls setApMaxSlippageBps when max slippage input changes", () => {
  const setApMaxSlippageBps = vi.fn();
  render(
    <StrategyParams
      {...defaultProps}
      activeStrategy="ARRIVAL_PRICE"
      setApMaxSlippageBps={setApMaxSlippageBps}
    />
  );
  fireEvent.change(screen.getByLabelText(/Max Slippage Bps/), {
    target: { value: "50" },
  });
  expect(setApMaxSlippageBps).toHaveBeenCalledWith("50");
});

test("does not render other strategy content when SNIPER is active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="SNIPER" />);
  expect(screen.queryByText(/TWAP Params/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/POV Params/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/ICEBERG Params/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/ARRIVAL PRICE Params/i)).not.toBeInTheDocument();
});

test("does not render other strategy content when ARRIVAL_PRICE is active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="ARRIVAL_PRICE" />);
  expect(screen.queryByText(/TWAP Params/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/SNIPER Params/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/ICEBERG Params/i)).not.toBeInTheDocument();
});
