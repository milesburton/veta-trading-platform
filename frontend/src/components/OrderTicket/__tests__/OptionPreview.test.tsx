import { render, screen } from "@testing-library/react";
import { OptionPreview } from "@veta/frontend/components/OrderTicket/OptionPreview";
import { describe, expect, it } from "vitest";

describe("OptionPreview", () => {
  it("renders nothing when quantity is zero", () => {
    const { container } = render(<OptionPreview qty={0} premium={5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when quantity is negative", () => {
    const { container } = render(<OptionPreview qty={-1} premium={5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when premium is zero", () => {
    const { container } = render(<OptionPreview qty={1} premium={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when premium is negative", () => {
    const { container } = render(<OptionPreview qty={1} premium={-5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses singular 'contract' for a quantity of exactly 1", () => {
    render(<OptionPreview qty={1} premium={1} />);
    expect(screen.getByText("1 contract")).toBeInTheDocument();
  });

  it("uses plural 'contracts' for a quantity other than 1", () => {
    render(<OptionPreview qty={3} premium={1} />);
    expect(screen.getByText("3 contracts")).toBeInTheDocument();
  });

  it("formats a small notional with two decimal places", () => {
    // qty * 100 * premium = 1 * 100 * 1 = 100
    render(<OptionPreview qty={1} premium={1} />);
    expect(screen.getByText(/\$100\.00/)).toBeInTheDocument();
  });

  it("formats a notional in the thousands with a K suffix", () => {
    // 5 * 100 * 3 = 1,500
    render(<OptionPreview qty={5} premium={3} />);
    expect(screen.getByText(/\$1\.5K/)).toBeInTheDocument();
  });

  it("formats a notional in the millions with an M suffix", () => {
    // 100 * 100 * 200 = 2,000,000
    render(<OptionPreview qty={100} premium={200} />);
    expect(screen.getByText(/\$2\.00M/)).toBeInTheDocument();
  });

  it("formats a notional exactly at the 1,000,000 boundary with an M suffix", () => {
    // 10 * 100 * 1000 = 1,000,000
    render(<OptionPreview qty={10} premium={1_000} />);
    expect(screen.getByText(/\$1\.00M/)).toBeInTheDocument();
  });

  it("formats a notional exactly at the 1,000 boundary with a K suffix", () => {
    // 10 * 100 * 1 = 1,000
    render(<OptionPreview qty={10} premium={1} />);
    expect(screen.getByText(/\$1\.0K/)).toBeInTheDocument();
  });
});
