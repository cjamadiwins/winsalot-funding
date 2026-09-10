// Semicircular 0-100 performance gauge shared by both CRMs. The public
// component name is retained so every existing Admin/Agent report and
// dashboard receives the upgrade without duplicating presentation logic.
export type PerformanceTier = "green" | "yellow" | "red";

const CENTER_X = 120;
const CENTER_Y = 116;
const ARC_RADIUS = 84;

const SEGMENTS = [
  { start: 0, end: 40, color: "#df7f82", label: "Needs improvement" },
  { start: 40, end: 70, color: "#efc76f", label: "Fair" },
  { start: 70, end: 90, color: "#78bd72", label: "Good" },
  { start: 90, end: 100, color: "#63b9c7", label: "Excellent" },
] as const;

const SCORE_COLOR: Record<PerformanceTier, string> = {
  green: "#58a966",
  yellow: "#d7a43c",
  red: "#ce676b",
};

function pointForScore(score: number, radius: number) {
  const angle = Math.PI - (Math.PI * score) / 100;
  return {
    x: CENTER_X + radius * Math.cos(angle),
    y: CENTER_Y - radius * Math.sin(angle),
  };
}

function arcPath(startScore: number, endScore: number) {
  const start = pointForScore(startScore, ARC_RADIUS);
  const end = pointForScore(endScore, ARC_RADIUS);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export default function PerformanceRing({
  percentage,
  tier,
  size = 136,
  strokeWidth = 12,
  label,
}: {
  percentage: number;
  tier: PerformanceTier;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const score = Math.max(0, Math.min(100, Math.round(percentage)));
  const needleTip = pointForScore(score, 67);
  const color = SCORE_COLOR[tier];

  return (
    <figure className="m-0 flex shrink-0 flex-col items-center" style={{ width: size }}>
      <svg
        viewBox="0 0 240 148"
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label={`Performance score ${score} out of 100${label ? `, ${label}` : ""}`}
      >
        {SEGMENTS.map((segment) => (
          <path
            key={segment.label}
            d={arcPath(segment.start, segment.end)}
            fill="none"
            stroke={segment.color}
            strokeWidth={strokeWidth * 1.7}
            strokeLinecap="butt"
          />
        ))}

        {[0, 20, 40, 60, 80, 100].map((tick) => {
          const position = pointForScore(tick, 108);
          return (
            <text key={tick} x={position.x} y={position.y + 4} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">
              {tick}
            </text>
          );
        })}

        {SEGMENTS.map((segment) => {
          const midpoint = (segment.start + segment.end) / 2;
          const position = pointForScore(midpoint, 84);
          const rotation = 180 - midpoint * 1.8;
          return (
            <text
              key={`${segment.label}-label`}
              x={position.x}
              y={position.y + 3}
              textAnchor="middle"
              transform={`rotate(${rotation} ${position.x} ${position.y})`}
              className="fill-white text-[7px] font-bold"
            >
              {segment.label}
            </text>
          );
        })}

        <line
          x1={CENTER_X}
          y1={CENTER_Y}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          aria-hidden="true"
        />
        <circle cx={CENTER_X} cy={CENTER_Y} r="25" fill={color} />
        <text x={CENTER_X} y={CENTER_Y + 8} textAnchor="middle" className="fill-white text-[25px] font-bold">
          {score}
        </text>
      </svg>
      {label ? <figcaption className="-mt-1 text-center text-[10.5px] font-medium text-slate-500">{label}</figcaption> : null}
    </figure>
  );
}
