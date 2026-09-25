import { describe, expect, it } from "vitest";
import { getOrderStageInfo, getStepperSteps, PICKUP_STEPPER_STEPS, STEPPER_STEPS } from "./order-stage";

describe("order stages", () => {
  it("keeps the 6-step delivery journey by default", () => {
    expect(getStepperSteps()).toBe(STEPPER_STEPS);
    expect(getOrderStageInfo("shipped").key).toBe("shipped");
  });

  it("uses a 4-step journey for pickup", () => {
    expect(getStepperSteps("pickup")).toBe(PICKUP_STEPPER_STEPS);
    expect(PICKUP_STEPPER_STEPS.map((s) => s.key)).toEqual(["order_placed", "payment_confirmed", "ready_for_pickup", "collected"]);
  });

  it.each([
    ["payment_pending", "order_placed", 0],
    ["verifying_payment", "order_placed", 0],
    ["payment_confirmed", "payment_confirmed", 1],
    ["processing", "payment_confirmed", 1],
    ["ready_for_pickup", "ready_for_pickup", 2],
    ["collected", "collected", 3],
    ["cancelled", "cancelled", null],
  ] as const)("pickup %s → %s (step %s)", (status, key, stepIndex) => {
    const info = getOrderStageInfo(status, undefined, "pickup");
    expect(info.key).toBe(key);
    expect(info.stepIndex).toBe(stepIndex);
  });
});
