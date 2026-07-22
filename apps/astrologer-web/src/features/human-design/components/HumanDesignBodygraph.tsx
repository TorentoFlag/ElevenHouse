import {
  humanDesignCenterGeometry,
  humanDesignChannelGeometry,
  humanDesignGateGeometry,
  type HumanDesignDetailKey,
  type HumanDesignViewModel
} from "../model/humanDesignViewModel";
import type { CSSProperties } from "react";
import styles from "./HumanDesignBodygraph.module.css";

export type HumanDesignBodygraphProps = {
  readonly model: HumanDesignViewModel;
  readonly selectedKey: HumanDesignDetailKey;
  readonly onSelect: (key: HumanDesignDetailKey) => void;
};

export function HumanDesignBodygraph({
  model,
  selectedKey,
  onSelect
}: HumanDesignBodygraphProps) {
  const definedCenters = new Set(model.definedCenterCodes);
  const activeChannels = new Set(model.result.definedChannels.map((channel) => channel.code));

  return (
    <svg
      className={styles.bodygraph}
      viewBox="0 0 440 620"
      role="img"
      aria-label="Бодиграф Human Design"
    >
      <defs>
        <filter id="human-design-center-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {humanDesignChannelGeometry.map((channel) => {
        const [firstGate, secondGate] = channel.gates;
        const first = getGatePoint(firstGate);
        const second = getGatePoint(secondGate);
        if (!first || !second) return null;
        const via = "via" in channel ? channel.via : [];
        const points = [[first.x, first.y] as const, ...via, [second.x, second.y] as const];
        const key = `ch:${channel.code}` as const;
        const isSelected = selectedKey === key;
        const isActive = activeChannels.has(channel.code);

        return (
          <g key={channel.code}>
            <polyline
              className={isSelected ? styles.channelSelected : styles.channelBase}
              points={toPolyline(points)}
            />
            {isActive ? (
              <polyline
                className={styles.channelActive}
                points={toPolyline(points)}
                onClick={() => onSelect(key)}
              >
                <title>{`Канал ${channel.code.replace("-", "–")}`}</title>
              </polyline>
            ) : (
              <polyline
                className={styles.channelHitArea}
                points={toPolyline(points)}
                onClick={() => onSelect(key)}
              >
                <title>{`Канал ${channel.code.replace("-", "–")}`}</title>
              </polyline>
            )}
          </g>
        );
      })}
      {humanDesignCenterGeometry.map((center) => {
        const modelCenter = model.centers.find((item) => item.code === center.code);
        const isDefined = definedCenters.has(center.code);
        const isSelected = selectedKey === center.code;
        const className = [
          styles.center,
          isDefined ? styles.centerDefined : styles.centerOpen,
          isSelected ? styles.centerSelected : ""
        ]
          .filter(Boolean)
          .join(" ");
        const commonProps = {
          className,
          style: isDefined && modelCenter ? centerColorStyle(modelCenter.color) : undefined,
          onClick: () => onSelect(center.code)
        } as const;

        return (
          <g key={center.code}>
            <title>{modelCenter?.label ?? center.code}</title>
            {"rect" in center ? (
              <rect
                x={center.rect[0]}
                y={center.rect[1]}
                width={center.rect[2]}
                height={center.rect[3]}
                rx={center.rect[4]}
                {...commonProps}
              />
            ) : (
              <polygon points={center.polygon} {...commonProps} />
            )}
          </g>
        );
      })}
      {Object.entries(humanDesignGateGeometry).map(([gate, point]) => {
        const number = Number(gate);
        const sides = model.activeGates.get(number);
        const isPersonality = sides?.has("personality") ?? false;
        const isDesign = sides?.has("design") ?? false;
        const isDefinedCenter = definedCenters.has(point.center);

        return (
          <g
            className={styles.gate}
            key={gate}
            onClick={() => onSelect(point.center)}
          >
            <title>{`Ворота ${gate}`}</title>
            {isPersonality && isDesign ? (
              <>
                <path
                  d={`M ${point.x} ${point.y - 7.5} A 7.5 7.5 0 0 0 ${point.x} ${point.y + 7.5} Z`}
                  className={styles.gatePersonality}
                />
                <path
                  d={`M ${point.x} ${point.y - 7.5} A 7.5 7.5 0 0 1 ${point.x} ${point.y + 7.5} Z`}
                  className={styles.gateDesign}
                />
              </>
            ) : (
              <circle
                cx={point.x}
                cy={point.y}
                r="7.5"
                className={
                  isPersonality
                    ? styles.gatePersonality
                    : isDesign
                      ? styles.gateDesign
                      : isDefinedCenter
                        ? styles.gateDefined
                        : styles.gateOpen
                }
              />
            )}
            <text
              className={isPersonality || isDesign ? styles.gateTextActive : styles.gateText}
              x={point.x}
              y={point.y + 2.9}
              textAnchor="middle"
            >
              {gate}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function toPolyline(points: readonly (readonly [number, number])[]) {
  return points.map((point) => point.join(",")).join(" ");
}

function getGatePoint(gate: number) {
  return humanDesignGateGeometry[gate as keyof typeof humanDesignGateGeometry];
}

function centerColorStyle(color: string): CSSProperties {
  return { "--center-color": color } as CSSProperties;
}
