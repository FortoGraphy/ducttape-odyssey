// Static artwork of the point defense field (react-native-svg). Everything is drawn once; motion is
// applied by the parent views.
import { memo } from "react";
import Svg, { Circle, G, Line, Path, Polygon, Rect } from "react-native-svg";

import { palette } from "@/ui/theme";

const OUTLINE = palette.void0;

const ROCK_SHAPES = [
  { body: "22,2 34,6 41,17 39,31 29,41 14,40 4,30 3,15 11,5", facet: "22,2 34,6 30,14 17,13 11,5", shade: "39,31 29,41 14,40 20,32 32,27" },
  { body: "19,3 31,4 40,13 41,27 33,39 18,41 6,34 3,20 9,8", facet: "19,3 31,4 28,12 15,14 9,8", shade: "41,27 33,39 18,41 22,33 34,25" },
  { body: "24,3 36,9 41,21 36,35 23,41 10,37 3,25 6,11 14,4", facet: "24,3 36,9 29,15 17,12 14,4", shade: "36,35 23,41 10,37 18,31 31,29" },
];

/** Plain rock, 44x44 with the centre at (22, 22). One tap. */
export const RockSprite = memo(function RockSprite({ variant }: { variant: number }) {
  const shape = ROCK_SHAPES[variant % ROCK_SHAPES.length];
  const warm = variant % 3 === 1;
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      <Polygon points={shape.body} fill={warm ? palette.rust1 : palette.steel1} stroke={OUTLINE} strokeWidth={1.5} strokeLinejoin="round" />
      <Polygon points={shape.facet} fill={warm ? palette.amber : palette.steel3} opacity={warm ? 0.75 : 0.9} />
      <Polygon points={shape.shade} fill={warm ? palette.rust0 : palette.steel0} />
      <Circle cx={17} cy={24} r={3.2} fill={warm ? palette.rust0 : palette.steel0} />
      <Circle cx={27} cy={20} r={1.8} fill={warm ? palette.rust0 : palette.steel0} />
    </Svg>
  );
});

/** Boulder, 68x68 with the centre at (34, 34). Glowing cracks say "this one breaks apart". */
export const BigSprite = memo(function BigSprite() {
  return (
    <Svg width={68} height={68} viewBox="0 0 68 68">
      <Polygon points="30,3 47,6 60,18 65,35 58,53 42,64 23,63 8,52 3,34 9,16 19,6" fill={palette.steel1} stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
      <Polygon points="30,3 47,6 60,18 50,24 33,19 19,6" fill={palette.steel2} />
      <Polygon points="30,3 47,6 44,12 28,11 19,6" fill={palette.steel3} />
      <Polygon points="58,53 42,64 23,63 8,52 22,50 40,53 55,44" fill={palette.steel0} />
      <Path d="M33 19 30 31 38 39 34 53" stroke={palette.rust0} strokeWidth={5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M30 31 17 36M38 39 52 35" stroke={palette.rust0} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Path d="M33 19 30 31 38 39 34 53" stroke={palette.orange} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M30 31 17 36M38 39 52 35" stroke={palette.amber} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Circle cx={20} cy={22} r={4} fill={palette.steel0} />
      <Circle cx={47} cy={49} r={3} fill={palette.void3} />
    </Svg>
  );
});

/** Fast streak, 72x72 with the head at the centre; the tail points to -x (the view is rotated to its heading). */
export const FastSprite = memo(function FastSprite() {
  return (
    <Svg width={72} height={72} viewBox="0 0 72 72">
      <Polygon points="36,27 2,34 0,36 2,38 36,45" fill={palette.rust1} opacity={0.55} />
      <Polygon points="36,30 12,35 10,36 12,37 36,42" fill={palette.orange} opacity={0.8} />
      <Polygon points="36,33 22,35.5 22,36.5 36,39" fill={palette.yellow} />
      <Polygon points="36,25 44,28 47,36 44,44 36,47 28,43 26,36 29,28" fill={palette.amber} stroke={OUTLINE} strokeWidth={1.5} strokeLinejoin="round" />
      <Polygon points="36,29 42,31 44,36 41,41 36,43 31,40 30,36 32,31" fill={palette.yellow} />
      <Circle cx={38} cy={35} r={2.5} fill={palette.bone2} />
    </Svg>
  );
});

/** Salvage crate, 44x44 with the centre at (22, 22). Mint brackets mark it as friendly. */
export const CrateSprite = memo(function CrateSprite() {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      <Path d="M2 10V2h8M34 2h8v8M42 34v8h-8M10 42H2v-8" stroke={palette.mint} strokeWidth={2} fill="none" strokeLinecap="square" />
      <Rect x={8} y={8} width={28} height={28} rx={3} fill={palette.bone0} stroke={OUTLINE} strokeWidth={1.5} />
      <Rect x={8} y={8} width={28} height={9} rx={3} fill={palette.bone2} />
      <Rect x={8} y={28} width={28} height={8} rx={3} fill={palette.steel3} />
      <Rect x={19} y={8} width={6} height={28} fill={palette.yellow} />
      <Rect x={19} y={19} width={6} height={6} fill={palette.steel0} />
      <Rect x={11} y={20} width={5} height={5} rx={1} fill={palette.green1} />
      <Rect x={28} y={20} width={5} height={5} rx={1} fill={palette.green1} />
    </Svg>
  );
});

/** The tug from above, 96x44, turret at (48, 14). */
export const ShipSprite = memo(function ShipSprite() {
  return (
    <Svg width={96} height={44} viewBox="0 0 96 44">
      {/* cargo cradle, left */}
      <Rect x={6} y={20} width={22} height={18} rx={2} fill={palette.steel0} stroke={OUTLINE} strokeWidth={1.5} />
      <Rect x={9} y={23} width={7} height={12} fill={palette.rust1} />
      <Rect x={18} y={23} width={7} height={12} fill={palette.teal1} />
      {/* oversized engine, right */}
      <Rect x={68} y={14} width={24} height={26} rx={4} fill={palette.steel1} stroke={OUTLINE} strokeWidth={1.5} />
      <Rect x={72} y={18} width={16} height={5} fill={palette.steel3} />
      <Rect x={72} y={34} width={16} height={6} rx={2} fill={palette.orange} />
      <Rect x={75} y={36} width={10} height={4} rx={1} fill={palette.yellow} />
      {/* hull */}
      <Path d="M24 40V20l8-9h32l8 9v20z" fill={palette.steel2} stroke={OUTLINE} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M32 11h32l8 9H24z" fill={palette.steel3} />
      <Rect x={28} y={26} width={14} height={10} fill={palette.bone0} />
      <Rect x={54} y={24} width={12} height={12} fill={palette.cobalt0} />
      <Rect x={26} y={30} width={22} height={3} fill={palette.bone2} transform="rotate(-14 37 31)" />
      {/* bent antenna */}
      <Path d="M30 12 27 5 22 3" stroke={palette.steel3} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={22} cy={3} r={1.6} fill={palette.red1} />
      {/* turret */}
      <Rect x={46} y={0} width={4} height={12} rx={1} fill={palette.bone1} stroke={OUTLINE} strokeWidth={1} />
      <Circle cx={48} cy={15} r={7.5} fill={palette.steel1} stroke={OUTLINE} strokeWidth={1.5} />
      <Circle cx={48} cy={15} r={3.5} fill={palette.mint} />
    </Svg>
  );
});

/** Radar rings and spokes centred on the ship. Pure decoration behind the action. */
export const RadarGrid = memo(function RadarGrid({ w, h, cx, cy, lineY }: { w: number; h: number; cx: number; cy: number; lineY: number }) {
  const reach = Math.hypot(Math.max(cx, w - cx), cy);
  const rings: number[] = [];
  for (let r = reach * 0.22; r < reach * 1.02; r += reach * 0.2) rings.push(r);
  const spokes: number[] = [];
  for (let a = -75; a <= 75; a += 25) spokes.push((a * Math.PI) / 180);
  const dots: { x: number; y: number }[] = [];
  for (let y = 18; y < lineY - 10; y += 36) for (let x = 18; x < w; x += 36) dots.push({ x, y });
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <G opacity={0.9}>
        {dots.map((d, i) => (
          <Rect key={`d${i}`} x={d.x} y={d.y} width={1.5} height={1.5} fill={palette.teal0} />
        ))}
        {rings.map((r, i) => (
          <Circle key={`r${i}`} cx={cx} cy={cy} r={r} stroke={i % 2 === 0 ? palette.teal0 : palette.teal1} strokeOpacity={i % 2 === 0 ? 1 : 0.55} strokeWidth={1} fill="none" />
        ))}
        {spokes.map((a, i) => (
          <Line key={`s${i}`} x1={cx} y1={cy} x2={cx + Math.sin(a) * reach} y2={cy - Math.cos(a) * reach} stroke={palette.teal0} strokeWidth={1} />
        ))}
      </G>
      {/* hull line: what passes this hurts */}
      <Line x1={0} y1={lineY} x2={w} y2={lineY} stroke={palette.red0} strokeWidth={1.5} strokeDasharray="6 5" />
    </Svg>
  );
});

/** Tiny crate for the legend chip. */
export function CrateIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="6 6 32 32">
      <Rect x={8} y={8} width={28} height={28} rx={3} fill={palette.bone0} stroke={OUTLINE} strokeWidth={1.5} />
      <Rect x={19} y={8} width={6} height={28} fill={palette.yellow} />
      <Rect x={8} y={28} width={28} height={8} rx={3} fill={palette.steel3} />
    </Svg>
  );
}

export function RockIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      <Polygon points={ROCK_SHAPES[0].body} fill={palette.steel1} stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
      <Polygon points={ROCK_SHAPES[0].facet} fill={palette.steel3} />
    </Svg>
  );
}
