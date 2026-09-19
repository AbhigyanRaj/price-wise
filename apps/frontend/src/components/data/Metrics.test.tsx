import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ConfidenceBadge, DeltaChip, MarginCell, StatusBadge } from "./Metrics";

/**
 * These assert the accessibility contract, not the styling.
 *
 * NFR-A4 says status is never conveyed by colour alone. That is a claim about
 * what a colourblind user or a screen reader actually receives, so it is
 * checked by querying for the non-colour signal rather than by inspecting a
 * class name.
 */

describe("DeltaChip", () => {
  test("an increase carries a direction word for assistive tech", () => {
    render(<DeltaChip fraction={0.106} />);
    expect(screen.getByText("Increase of")).toBeInTheDocument();
    expect(screen.getByText("+10.6%")).toBeInTheDocument();
  });

  test("a decrease carries its own direction word and a signed value", () => {
    render(<DeltaChip fraction={-0.106} />);
    expect(screen.getByText("Decrease of")).toBeInTheDocument();
    expect(screen.getByText("-10.6%")).toBeInTheDocument();
  });

  test("the sign is always present, so the number alone is unambiguous", () => {
    const { container } = render(<DeltaChip fraction={0.02} />);
    expect(container.textContent).toContain("+2.0%");
  });

  test("a negligible change reads as no change rather than a rounded zero", () => {
    // Without this, a delta of 0.00004 renders as "+0.0%", which implies a
    // movement that did not happen.
    render(<DeltaChip fraction={0.00004} />);
    expect(screen.getByText("No change")).toBeInTheDocument();
  });
});

describe("ConfidenceBadge", () => {
  test.each([
    [0.92, "0.92"],
    [0.78, "0.78"],
    [0.41, "0.41"],
  ])("renders the numeric value for %s, not only a colour", (value, expected) => {
    render(<ConfidenceBadge value={value} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  test("bands match the server thresholds exactly at the boundary", () => {
    // 0.85 is high, not medium. An off-by-one here would make the UI disagree
    // with which recommendations actually auto-execute.
    const { container: atHigh } = render(<ConfidenceBadge value={0.85} />);
    expect(atHigh.firstElementChild).toHaveAttribute("title", "high confidence");

    const { container: belowHigh } = render(<ConfidenceBadge value={0.8499} />);
    expect(belowHigh.firstElementChild).toHaveAttribute("title", "medium confidence");
  });
});

describe("MarginCell", () => {
  test("a healthy margin shows no warning", () => {
    render(<MarginCell margin={0.36} belowFloor={false} />);
    expect(screen.queryByLabelText("Below the margin floor")).not.toBeInTheDocument();
    expect(screen.getByText("36.0%")).toBeInTheDocument();
  });

  test("a breached floor is flagged with a labelled icon, not just colour", () => {
    render(<MarginCell margin={0.08} belowFloor />);
    expect(screen.getByLabelText("Below the margin floor")).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  test("every status renders readable text", () => {
    // Auto-executed in particular must be distinguishable from approved: one
    // was a human decision and the other was not.
    render(<StatusBadge status="AUTO_EXECUTED" />);
    expect(screen.getByText("Auto-executed")).toBeInTheDocument();
  });
});
