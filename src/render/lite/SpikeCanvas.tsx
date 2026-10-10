import { View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";

export default function SpikeCanvas({ width, height }: { width: number; height: number }) {
  return (
    <View style={{ width, height, backgroundColor: "#07090F" }}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="neb" cx="60%" cy="40%" r="70%">
            <Stop offset="0" stopColor="#2A1A52" stopOpacity="1" />
            <Stop offset="1" stopColor="#07090F" stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#neb)" />
        {Array.from({ length: 40 }, (_, i) => (
          <Circle key={i} cx={(i * 97) % width} cy={(i * 53) % height} r={i % 5 === 0 ? 1.5 : 1} fill="#E8ECF4" opacity={0.4 + (i % 4) * 0.15} />
        ))}
      </Svg>
    </View>
  );
}
