"use client";

import { observe } from "@legendapp/state";
import { useSelector } from "@legendapp/state/react";
import { axisBottom } from "d3-axis";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { useEffect, useRef } from "react";
import { useClippingStore } from "~/features/clipping/context/store.context";
import { formatTimestamp } from "~/lib/time-utils";

const TIMESTAMPS_HEIGHT = 24;

/**
 * Timeline timestamps using D3-axis with smart tick intervals.
 *
 * - Major ticks: lines with labels (at intervals based on zoom)
 * - Minor ticks: small dots between major ticks
 * - Automatic interval adjustment based on visible timespan
 */
export function TimelineTimestamps() {
  const $store = useClippingStore();
  const svgRef = useRef<SVGSVGElement>(null);

  const containerWidth = useSelector(() =>
    $store.timeline.containerWidth.get(),
  );

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = select(svgRef.current);

    // Create groups for major axis and minor dots (positioned at top)
    let axisGroup = svg.select<SVGGElement>("g.axis-major");
    if (axisGroup.empty()) {
      axisGroup = svg
        .append("g")
        .attr("class", "axis-major")
        .attr("transform", "translate(0, 0)");
    }

    let minorGroup = svg.select<SVGGElement>("g.axis-minor");
    if (minorGroup.empty()) {
      minorGroup = svg
        .append("g")
        .attr("class", "axis-minor")
        .attr("transform", "translate(0, 5)");
    }

    const dispose = observe(() => {
      const scrollOffset = $store.timeline.scrollOffset.get();
      const pps = $store.timeline.getPixelsPerSecond.get();
      const containerW = $store.timeline.containerWidth.get();
      const duration = $store.playback.duration.get();

      if (duration <= 0 || containerW <= 0 || pps <= 0) return;

      // Calculate visible time range with overscan
      const visibleStartTime = Math.max(0, scrollOffset / pps - 2);
      const visibleEndTime = Math.min(
        duration,
        (scrollOffset + containerW) / pps + 2,
      );
      const visibleTimespan = visibleEndTime - visibleStartTime;

      // Get tick intervals based on zoom level
      const { majorInterval, minorInterval } =
        getTickIntervals(visibleTimespan);

      // Create time scale
      const timeScale = scaleLinear()
        .domain([scrollOffset / pps, (scrollOffset + containerW) / pps])
        .range([0, containerW]);

      // Generate major tick values
      const majorTicks: number[] = [];
      const firstMajor =
        Math.ceil(visibleStartTime / majorInterval) * majorInterval;
      for (let t = firstMajor; t <= visibleEndTime; t += majorInterval) {
        majorTicks.push(Math.round(t * 1000) / 1000);
      }

      // Generate minor tick values (excluding positions that have major ticks)
      const minorTicks: number[] = [];
      if (minorInterval > 0) {
        const firstMinor =
          Math.ceil(visibleStartTime / minorInterval) * minorInterval;
        for (let t = firstMinor; t <= visibleEndTime; t += minorInterval) {
          const roundedT = Math.round(t * 1000) / 1000;
          // Skip if this is a major tick position
          if (Math.abs(roundedT % majorInterval) < 0.001) continue;
          minorTicks.push(roundedT);
        }
      }

      // Render major axis (ticks point downward from top)
      const majorAxis = axisBottom(timeScale)
        .tickValues(majorTicks)
        .tickSize(6)
        .tickPadding(4)
        .tickFormat((d) => formatTimestamp(d as number));

      axisGroup.call(majorAxis);

      // Style major axis
      axisGroup.select(".domain").remove(); // Remove the axis line
      axisGroup
        .selectAll(".tick line")
        .attr("class", "stroke-muted-foreground/50");
      axisGroup
        .selectAll(".tick text")
        .attr("class", "fill-muted-foreground text-[10px] font-mono");

      // Render minor dots using D3 data join
      const dots = minorGroup
        .selectAll<SVGCircleElement, number>("circle.minor-tick")
        .data(minorTicks, (d) => d);

      dots.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "minor-tick fill-muted-foreground/40")
            .attr("r", 1.5)
            .attr("cx", (d) => timeScale(d))
            .attr("cy", 0),
        (update) => update.attr("cx", (d) => timeScale(d)),
        (exit) => exit.remove(),
      );
    });

    return () => {
      dispose();
      svg.selectAll("g.axis-major, g.axis-minor").remove();
    };
  }, [$store]);

  return (
    <div className="relative h-6 shrink-0 overflow-hidden border-b bg-muted/30">
      <svg
        ref={svgRef}
        aria-hidden="true"
        className="h-full w-full"
        height={TIMESTAMPS_HEIGHT}
        width={containerWidth}
        viewBox={`0 0 ${containerWidth} ${TIMESTAMPS_HEIGHT}`}
        preserveAspectRatio="none"
      />
    </div>
  );
}

/**
 * Get tick intervals based on visible timespan.
 * Returns major interval (with labels) and minor interval (dots only).
 */
function getTickIntervals(visibleTimespan: number): {
  majorInterval: number;
  minorInterval: number;
} {
  // Very zoomed in: show every second with subsecond dots
  if (visibleTimespan <= 10) {
    return { majorInterval: 1, minorInterval: 0.5 };
  }
  // Zoomed in: show every 2 seconds with 1-second dots
  if (visibleTimespan <= 30) {
    return { majorInterval: 2, minorInterval: 1 };
  }
  // Medium zoom: show every 5 seconds with 1-second dots
  if (visibleTimespan <= 60) {
    return { majorInterval: 5, minorInterval: 1 };
  }
  // Zoomed out: show every 10 seconds with 5-second dots
  if (visibleTimespan <= 180) {
    return { majorInterval: 10, minorInterval: 5 };
  }
  // More zoomed out: show every 30 seconds with 10-second dots
  if (visibleTimespan <= 600) {
    return { majorInterval: 30, minorInterval: 10 };
  }
  // Very zoomed out: show every minute with 30-second dots
  if (visibleTimespan <= 1800) {
    return { majorInterval: 60, minorInterval: 30 };
  }
  // Extremely zoomed out: show every 5 minutes with 1-minute dots
  return { majorInterval: 300, minorInterval: 60 };
}
