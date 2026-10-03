import { CHART_COLORS } from "./chart-colors";
import { SegmentBar } from "./SegmentBar";

/** One bar split into Stall and Online, both labelled with rupees and a percentage that adds to 100. */
export function ShareBar({ stall, online, format }: { stall: number; online: number; format: (n: number) => string }) {
  return (
    <SegmentBar
      label="Stall vs online sales"
      parts={[
        { key: "stall", label: "Stall", value: stall, color: CHART_COLORS.stall, valueLabel: format(stall) },
        { key: "online", label: "Online", value: online, color: CHART_COLORS.online, valueLabel: format(online) },
      ]}
    />
  );
}
