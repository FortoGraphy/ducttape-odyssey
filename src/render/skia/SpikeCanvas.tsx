import { Canvas, Fill, Shader, Skia, useClock } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { useDerivedValue } from "react-native-reanimated";

const NEBULA = `
uniform float2 iRes;
uniform float iTime;

float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p); float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), u.x), mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x), u.y);
}

half4 main(float2 xy) {
  // 180 px wide internal resolution, nearest-neighbour look
  float px = iRes.x / 180.0;
  float2 p = floor(xy / px) / 180.0;
  float n = noise(p * 4.0 + float2(iTime * 0.03, 0.0)) * 0.6 + noise(p * 9.0 - float2(0.0, iTime * 0.02)) * 0.4;
  float3 col = mix(float3(0.027, 0.035, 0.059), float3(0.16, 0.10, 0.32), smoothstep(0.35, 0.9, n));
  col += float3(1.0, 0.42, 0.10) * smoothstep(0.78, 1.0, n) * 0.35;
  float star = step(0.992, hash(floor(xy / px)));
  col += star * (0.6 + 0.4 * sin(iTime * 2.0 + hash(floor(xy / px) + 3.0) * 6.28));
  return half4(col, 1.0);
}`;

export default function SpikeCanvas({ width, height }: { width: number; height: number }) {
  const effect = useMemo(() => {
    try {
      return Skia.RuntimeEffect.Make(NEBULA);
    } catch {
      return null;
    }
  }, []);
  const clock = useClock();
  const uniforms = useDerivedValue(() => ({ iRes: [width, height], iTime: clock.value / 1000 }), [width, height]);

  return (
    <Canvas style={{ width, height }}>
      {effect ? (
        <Fill>
          <Shader source={effect} uniforms={uniforms} />
        </Fill>
      ) : (
        <Fill color="#07090F" />
      )}
    </Canvas>
  );
}
