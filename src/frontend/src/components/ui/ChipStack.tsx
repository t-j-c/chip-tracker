const CHIP_COLORS = ['#D93A2B', '#2F5DA8', '#2E9E5B', '#7A4BA8', '#F2B632', '#1B1718'];
const INK = '#1B1718';
const CREAM = '#F7EBCF';

interface ChipStackProps {
  count: number;
  size?: number;
  colorOffset?: number;
  className?: string;
}

export default function ChipStack({ count, size = 28, colorOffset = 0, className }: ChipStackProps) {
  const n = Math.max(1, Math.min(5, Math.round(count)));
  const width = 40;
  const rx = 18;
  const ry = 7.5;
  const thickness = 5;
  const height = ry * 2 + thickness * n + 4;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={(size * height) / width}
      className={className}
    >
      {Array.from({ length: n }, (_, i) => {
        const cy = height - 2 - ry - thickness - i * thickness;
        const color = CHIP_COLORS[(i + colorOffset) % CHIP_COLORS.length];
        return (
          <g key={i}>
            <path
              d={`M ${20 - rx} ${cy} v ${thickness} a ${rx} ${ry} 0 0 0 ${2 * rx} 0 v ${-thickness} z`}
              fill={color}
              stroke={INK}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <ellipse cx="20" cy={cy} rx={rx} ry={ry} fill={color} stroke={INK} strokeWidth="2" />
            <ellipse
              cx="20"
              cy={cy}
              rx={rx * 0.6}
              ry={ry * 0.6}
              fill="none"
              stroke={CREAM}
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </g>
        );
      })}
    </svg>
  );
}
