// Static artwork of the docking field. The station is built from plain views (a 500 pt SVG disc
// would be a large bitmap for nothing); the small sprites are react-native-svg.
import { memo } from "react";
import { View } from "react-native";
import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";

import { palette } from "@/ui/theme";

const OUTLINE = palette.void0;

/** The tug from above, 40x48, docking probe at the top, centre at (20, 24). */
export const TugSprite = memo(function TugSprite() {
  return (
    <Svg width={40} height={48} viewBox="0 0 40 48">
      {/* cargo cradle on the left, oversized engine pod on the right */}
      <Rect x={2} y={20} width={9} height={17} rx={1.5} fill={palette.steel0} stroke={OUTLINE} strokeWidth={1.2} />
      <Rect x={4} y={23} width={5} height={5} fill={palette.rust1} />
      <Rect x={4} y={30} width={5} height={4} fill={palette.teal1} />
      <Rect x={28} y={17} width={10} height={24} rx={3} fill={palette.steel1} stroke={OUTLINE} strokeWidth={1.2} />
      <Rect x={30} y={20} width={6} height={3} fill={palette.steel3} />
      <Rect x={30} y={36} width={6} height={5} rx={1.5} fill={palette.rust0} />
      {/* hull */}
      <Path d="M11 41V17l5-8h8l5 8v24z" fill={palette.steel2} stroke={OUTLINE} strokeWidth={1.2} strokeLinejoin="round" />
      <Path d="M16 9h8l5 8H11z" fill={palette.steel3} />
      <Rect x={13} y={27} width={7} height={9} fill={palette.bone0} />
      <Rect x={21} y={30} width={6} height={8} fill={palette.cobalt0} />
      <Rect x={12} y={24} width={16} height={2.5} fill={palette.bone2} transform="rotate(-12 20 25)" />
      <Path d="M15.5 17 20 13.5 24.5 17 23 20H17z" fill={palette.teal2} stroke={OUTLINE} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M17 16.5 20 14.5 21.5 16z" fill={palette.mint} />
      {/* main nozzle */}
      <Rect x={15} y={40} width={10} height={5} rx={1.5} fill={palette.steel0} stroke={OUTLINE} strokeWidth={1} />
      {/* docking probe */}
      <Rect x={18} y={2} width={4} height={8} rx={1} fill={palette.bone1} stroke={OUTLINE} strokeWidth={1} />
      <Rect x={16.5} y={1} width={7} height={3} rx={1} fill={palette.yellow} stroke={OUTLINE} strokeWidth={0.8} />
      {/* bent antenna */}
      <Path d="M12 18 8 13 5 14" stroke={palette.steel3} strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={5} cy={14} r={1.4} fill={palette.red1} />
    </Svg>
  );
});

/** Tumbling scrap, 36x36 with the centre at (18, 18); drawn for a radius of about 13. */
export const DebrisSprite = memo(function DebrisSprite({ variant }: { variant: number }) {
  if (variant % 2 === 1) {
    return (
      <Svg width={36} height={36} viewBox="0 0 36 36">
        <Polygon points="6,10 22,4 31,14 27,29 12,32 4,22" fill={palette.steel1} stroke={OUTLINE} strokeWidth={1.5} strokeLinejoin="round" />
        <Polygon points="6,10 22,4 20,12 10,15" fill={palette.steel3} />
        <Polygon points="27,29 12,32 15,24 25,22" fill={palette.steel0} />
        <Rect x={14} y={15} width={9} height={3} fill={palette.rust1} transform="rotate(20 18 16)" />
      </Svg>
    );
  }
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36">
      <Polygon points="5,14 14,5 28,7 32,19 24,31 10,29" fill={palette.rust1} stroke={OUTLINE} strokeWidth={1.5} strokeLinejoin="round" />
      <Polygon points="5,14 14,5 28,7 22,13 11,15" fill={palette.amber} opacity={0.7} />
      <Polygon points="32,19 24,31 10,29 16,23 27,20" fill={palette.rust0} />
      <Circle cx={15} cy={20} r={2.5} fill={palette.rust0} />
    </Svg>
  );
});

/** Sparse static stars; positions come from the seed stream of the caller. */
export const Stars = memo(function Stars({ w, h, points }: { w: number; h: number; points: { x: number; y: number; k: number }[] }) {
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {points.map((p, i) => (
        <Rect key={i} x={p.x * w} y={p.y * h} width={p.k > 0.8 ? 2 : 1.5} height={p.k > 0.8 ? 2 : 1.5} fill={p.k > 0.8 ? palette.cobalt2 : p.k > 0.4 ? palette.steel2 : palette.steel1} opacity={0.5 + p.k * 0.4} />
      ))}
    </Svg>
  );
});

function RimBlock({ r, angle, depth, width, height, color, radius = 1 }: { r: number; angle: number; depth: number; width: number; height: number; color: string; radius?: number }) {
  // `angle` in degrees from straight down, positive towards +x; `depth` is how far inside the rim.
  const a = (angle * Math.PI) / 180;
  const d = r - depth;
  return (
    <View
      style={{
        position: "absolute",
        left: r + Math.sin(a) * d - width / 2,
        top: r + Math.cos(a) * d - height / 2,
        width,
        height,
        borderRadius: radius,
        backgroundColor: color,
        transform: [{ rotate: `${-angle}deg` }],
      }}
    />
  );
}

/**
 * The station disc with its port at the bottom (angle 0). The parent rotates the whole view around
 * its centre, so the port, its guide lights and the approach line swing together.
 */
export const Station = memo(function Station({ r, collar, corridor, mouth, children }: { r: number; collar: number; corridor: number; mouth: number; children?: React.ReactNode }) {
  const windows: number[] = [];
  for (let a = -52; a <= 52; a += 4.5) if (Math.abs(a) > 9) windows.push(a);
  const struts: number[] = [];
  for (let a = -48; a <= 48; a += 12) if (Math.abs(a) > 8) struts.push(a);
  // `mouth` is the half width of the opening between the guide prongs.
  const hazard = ((mouth + 12) / r) * (180 / Math.PI);
  return (
    <View style={{ width: r * 2, height: r * 2 }}>
      <View style={{ position: "absolute", left: 0, top: 0, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: palette.steel1, borderWidth: 2, borderColor: palette.steel3 }} />
      <View style={{ position: "absolute", left: 13, top: 13, width: (r - 13) * 2, height: (r - 13) * 2, borderRadius: r - 13, backgroundColor: palette.steel0, borderWidth: 1.5, borderColor: palette.void0 }} />
      <View style={{ position: "absolute", left: 34, top: 34, width: (r - 34) * 2, height: (r - 34) * 2, borderRadius: r - 34, backgroundColor: palette.void3, borderWidth: 2, borderColor: palette.steel1 }} />
      {struts.map((a) => (
        <RimBlock key={`s${a}`} r={r} angle={a} depth={7} width={4} height={11} color={palette.steel2} />
      ))}
      {windows.map((a, i) => (
        <RimBlock key={`w${a}`} r={r} angle={a} depth={24} width={7} height={5} color={i % 5 === 2 ? palette.teal2 : i % 3 === 0 ? palette.steel1 : palette.yellow} />
      ))}
      {/* hazard blocks either side of the port */}
      <RimBlock r={r} angle={-hazard} depth={6.5} width={8} height={9} color={palette.orange} />
      <RimBlock r={r} angle={hazard} depth={6.5} width={8} height={9} color={palette.orange} />
      {/* port recess and guide prongs */}
      <View style={{ position: "absolute", left: r - mouth, top: r * 2 - 24, width: mouth * 2, height: 24, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: palette.void0, borderWidth: 1.5, borderColor: palette.steel3, borderBottomWidth: 0 }} />
      <View style={{ position: "absolute", left: r - mouth - 5, top: r * 2 - 3, width: 5, height: collar + 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: palette.bone1 }} />
      <View style={{ position: "absolute", left: r + mouth, top: r * 2 - 3, width: 5, height: collar + 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: palette.bone1 }} />
      <View style={{ position: "absolute", left: r - 7, top: r * 2 - 9, width: 14, height: 5, borderRadius: 1.5, backgroundColor: palette.teal2 }} />
      {/* approach line (supplied by the game: it lights up with alignment) */}
      <View style={{ position: "absolute", left: r - 20, top: r * 2 + collar, width: 40, height: corridor }}>{children}</View>
    </View>
  );
});
