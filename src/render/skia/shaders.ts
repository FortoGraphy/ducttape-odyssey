// SkSL sources. Every effect is compiled exactly once, at module scope, inside try/catch: a null
// effect makes the renderer fall back to flat fills for that layer instead of crashing.
//
// All shaders work in internal pixels (the low-res surface), snap to pixel centres themselves and
// output palette colors only: continuous values are mapped onto a ramp through a 4x4 ordered
// (Bayer) dither. Uniforms are passed as one flat float list in declaration order.
import { Skia } from "@shopify/react-native-skia";
import type { SkRuntimeEffect } from "@shopify/react-native-skia";

const LIB = `
float hash21(float2 p) {
  float3 p3 = fract(float3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash31(float3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + float2(1.0, 0.0)), u.x),
             mix(hash21(i + float2(0.0, 1.0)), hash21(i + float2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(float3 p) {
  float3 i = floor(p);
  float3 f = fract(p);
  float3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(i), hash31(i + float3(1.0, 0.0, 0.0)), u.x),
                mix(hash31(i + float3(0.0, 1.0, 0.0)), hash31(i + float3(1.0, 1.0, 0.0)), u.x), u.y);
  float b = mix(mix(hash31(i + float3(0.0, 0.0, 1.0)), hash31(i + float3(1.0, 0.0, 1.0)), u.x),
                mix(hash31(i + float3(0.0, 1.0, 1.0)), hash31(i + float3(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(float2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + float2(17.1, 9.2);
    a *= 0.5;
  }
  return s / 0.96875;
}
float fbm3(float3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise3(p);
    p = p * 2.02 + float3(13.1, 7.7, 5.3);
    a *= 0.5;
  }
  return s / 0.9375;
}
float bayer2(float2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(float2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}
`;

// uOff(2) uSeed(1) uRampA(18) uRampB(18) = 39 floats
const NEBULA = `
uniform float2 uOff;
uniform float uSeed;
uniform float3 uRampA[6];
uniform float3 uRampB[6];
${LIB}
half4 main(float2 xy) {
  float2 px = floor(xy);
  float2 q = (px + uOff) / 92.0 + float2(uSeed * 3.17, uSeed * 1.31);
  float2 w = float2(fbm(q * 1.3 + float2(3.1, 0.4)), fbm(q * 1.3 + float2(7.7, 1.9)));
  float d = fbm(q * 1.7 + (w - 0.5) * 2.4);
  float m = fbm(q * 0.6 + float2(11.0, 4.0));
  float lane = abs(vnoise(q * 2.6 + w * 1.7) - 0.5) * 2.0;
  float t = (d * 0.8 + m * 0.75 - 0.585) * 2.0;
  t = t * (1.0 - 0.22 * clamp(t, 0.0, 1.0));
  t *= 0.55 + 0.45 * smoothstep(0.0, 0.35, lane);
  t = clamp(t, 0.0, 0.985);
  float sel = fbm(q * 0.85 + float2(21.0, 13.0));
  float dth = bayer4(px);
  float x = t * 5.0;
  float i = floor(x);
  float f = smoothstep(0.3, 0.7, x - i);
  float idx = i + step(dth + 0.03, f);
  bool useB = sel + (dth - 0.5) * 0.1 > 0.54;
  float3 c = uRampA[0];
  for (int k = 1; k < 6; k++) {
    if (float(k) <= idx + 0.001) {
      c = useB ? uRampB[k] : uRampA[k];
    }
  }
  return half4(c, 1.0);
}`;

// uC(2) uR uKind uGlow uRays(4) uRamp(15) = 21 floats
// uKind: 0 plain star, 1 black hole, 2 binary, 3 protostar
const STAR = `
uniform float2 uC;
uniform float uR;
uniform float uKind;
uniform float uGlow;
uniform float uRays;
uniform float3 uRamp[5];
${LIB}
float starI(float2 d, float r0) {
  float r = length(d);
  if (r <= r0) { return 1.0; }
  float i = uGlow * pow(r0 / r, 1.25);
  float ray = max(0.0, 1.0 - r / (r0 * 7.0)) * uRays;
  if (abs(d.y) < 0.6 || abs(d.x) < 0.6) { i = max(i, ray); }
  return min(i, 0.96);
}
half4 main(float2 xy) {
  float2 px = floor(xy);
  float2 d = px + 0.5 - uC;
  float dth = bayer4(px);
  float i = 0.0;
  bool hole = false;
  if (uKind < 0.5) {
    i = starI(d, uR);
  } else if (uKind < 1.5) {
    float r = length(d);
    float2 e = float2(d.x * 0.94 - d.y * 0.34, (d.x * 0.34 + d.y * 0.94) * 3.4);
    float re = length(e);
    float ring = smoothstep(uR * 1.25, uR * 1.7, re) * smoothstep(uR * 4.2, uR * 2.0, re);
    float halo = smoothstep(uR + 2.2, uR + 0.4, r) * step(uR, r);
    bool front = (d.x * 0.34 + d.y * 0.94) > 0.0;
    i = max(ring * 0.95, halo * 0.8);
    i = max(i, uGlow * pow(uR / max(r, 0.001), 1.6) * 0.6);
    if (r <= uR && !(front && ring > 0.3)) { hole = true; }
  } else if (uKind < 2.5) {
    i = max(starI(d, uR), starI(d - float2(uR * 2.9, uR * 1.3), uR * 0.55) * 0.92);
  } else {
    float r = length(d);
    float n = fbm(px * 0.11 + uC);
    i = uGlow * pow(uR / max(r, uR * 0.5), 0.9) * (0.55 + n * 0.9);
    float2 e = float2(d.x, d.y * 4.0);
    i = max(i, smoothstep(uR * 5.0, uR * 1.5, length(e)) * 0.62);
    if (r <= uR * 0.6) { i = 1.0; }
    i = min(i, 1.0);
  }
  if (hole) { return half4(0.02, 0.024, 0.04, 1.0); }
  // fade to nothing before the edge of the quad, and drop the sparsest dither level
  i *= 1.0 - smoothstep(24.0, 58.0, length(d));
  float x = max(0.0, i * 5.0 - 0.22);
  float lvl = floor(x);
  float idx = lvl + step(dth + 0.02, x - lvl) - 1.0;
  if (idx < 0.0) { return half4(0.0); }
  float3 c = uRamp[0];
  for (int k = 1; k < 5; k++) {
    if (float(k) <= idx + 0.001) { c = uRamp[k]; }
  }
  return half4(c, 1.0);
}`;

// One effect per biome kind, so a planet only ever compiles the code of its own surface (the
// combined shader took seconds to compile on Direct3D; Metal is faster but the hitch is the same idea).
// uC(2) uR uSeed uRot uKind uRings uPass uAtmo(7) uL(3) uRamp(18) = 30 floats
// uKind is unused (kept so every variant shares one uniform layout): the kind selects the effect.
// uRamp: shadow, deep, dark, mid, light, accent. uPass: 0 = lit surface, 1 = emissive only.
const PLANET_CELLS = `float3 cells(float3 p) {
  float3 i = floor(p - 0.5);
  float3 f = p - i;
  float best = 9.0;
  float second = 9.0;
  float id = 0.0;
  for (int z = 0; z <= 1; z++) {
    for (int y = 0; y <= 1; y++) {
      for (int x = 0; x <= 1; x++) {
        float3 g = float3(float(x), float(y), float(z));
        float3 c = i + g;
        float3 o = float3(hash31(c), hash31(c + 17.3), hash31(c + 41.7)) * 0.8 + 0.1;
        float3 r = g + o - f;
        float d = dot(r, r);
        if (d < best) {
          second = best;
          best = d;
          id = hash31(c + 5.5);
        } else if (d < second) {
          second = d;
        }
      }
    }
  }
  return float3(sqrt(best), sqrt(second), id);
}`;
const PLANET_KINDS: string[] = [
  // rock
  `    float h = fbm3(sp * 2.4);
    float3 c = cells(sp * 3.4);
    float has = step(0.5, c.z);
    alb = h * 0.9 + 0.08 - smoothstep(0.3, 0.2, c.x) * has * 0.32 + smoothstep(0.07, 0.0, abs(c.x - 0.33)) * has * 0.25;`,
  // gas
  `    float warp = fbm3(float3(sp.x * 1.4, sp.y * 4.5, sp.z * 1.4)) - 0.5;
    float lat = S.y + warp * 0.2;
    alb = vnoise(float2(lat * 6.5 + uSeed * 5.0, 3.3)) * 0.72 + vnoise(float2(lat * 17.0, 9.1 + uSeed)) * 0.28;
    float3 A = float3(0.48, 0.28, 0.83);
    float sd = length((S - A) * float3(1.0, 2.3, 1.0));
    feat = step(sd, 0.17);
    alb = mix(alb, 0.95, smoothstep(0.3, 0.2, sd) * (1.0 - feat));`,
  // ice
  `    float h = fbm3(sp * 2.2);
    float crack = smoothstep(0.035, 0.0, abs(fbm3(sp * 4.2 + 7.0) - 0.5));
    alb = 0.5 + h * 0.5 - crack * 0.6;
    alb = mix(alb, 1.0, smoothstep(0.6, 0.78, abs(S.y) + h * 0.22));`,
  // lava
  `    float h = fbm3(sp * 2.6);
    float crack = smoothstep(0.03, 0.008, abs(fbm3(sp * 3.1 + 4.0) - 0.5));
    alb = 0.1 + h * 0.62;
    glow = max(crack, smoothstep(0.74, 0.8, h));
    feat = step(0.45, glow);`,
  // ocean
  `    float h = fbm3(sp * 2.1);
    float land = smoothstep(0.545, 0.56, h);
    alb = mix(0.02 + h * 0.72, 0.6 + (h - 0.55) * 1.7, land);
    float cl = fbm3(sp * 2.7 + float3(uRot * 0.35, 9.0, 0.0));
    alb = mix(alb, 1.0, smoothstep(0.6, 0.64, cl));
    float3 H = normalize(uL + float3(0.0, 0.0, 1.0));
    feat = step(0.9972, dot(N, H)) * (1.0 - land) * (1.0 - smoothstep(0.58, 0.6, cl));`,
  // desert
  `    float dune = fbm3(float3(sp.x * 2.0, sp.y * 9.0, sp.z * 2.0));
    float h = fbm3(sp * 1.8 + 3.0);
    alb = 0.3 + dune * 0.36 + h * 0.42 - smoothstep(0.6, 0.68, fbm3(sp * 3.0 + 12.0)) * 0.5;`,
  // toxic
  `    float3 wv = float3(fbm3(sp * 2.0), fbm3(sp * 2.0 + 5.2), fbm3(sp * 2.0 + 9.7)) - 0.5;
    float h = fbm3(sp * 1.8 + wv * 2.6);
    alb = h * 1.05;
    glow = smoothstep(0.03, 0.0, abs(h - 0.55));
    feat = step(0.5, glow);
    glow *= 0.4;`,
  // crystal
  `    float3 c = cells(sp * 3.3);
    alb = 0.15 + c.z * 0.85 - smoothstep(0.07, 0.0, c.y - c.x) * 0.5;
    feat = step(0.9, c.z) * step(0.07, c.y - c.x);
    glow = feat * 0.45;`,
];
const PLANET = `
uniform float2 uC;
uniform float uR;
uniform float uSeed;
uniform float uRot;
uniform float uKind;
uniform float uRings;
uniform float uPass;
uniform float uAtmo;
uniform float3 uL;
uniform float3 uRamp[6];
${LIB}
float3 pick(float idx) {
  float3 c = uRamp[0];
  for (int k = 1; k < 6; k++) {
    if (float(k) <= idx + 0.001) { c = uRamp[k]; }
  }
  return c;
}
/*CELLS*/
half4 main(float2 xy) {
  float2 pxl = floor(xy);
  float2 n2 = (pxl + 0.5 - uC) / uR;
  float r2 = dot(n2, n2);
  float dth = bayer4(pxl);
  float3 base = float3(0.0);
  float3 emis = float3(0.0);
  float alpha = 0.0;

  // ring plane, tilted towards the viewer; the far half is hidden behind the disc
  float ringOn = 0.0;
  float ringFront = 0.0;
  float3 ringC = float3(0.0);
  if (uRings > 0.5) {
    float2 q = float2(n2.x * 0.9397 + n2.y * 0.342, -n2.x * 0.342 + n2.y * 0.9397);
    float rr = length(float2(q.x, q.y / 0.27));
    if (rr > 1.32 && rr < 2.3) {
      float band = vnoise(float2(rr * 11.0, uSeed * 7.0));
      float fine = vnoise(float2(rr * 31.0, uSeed * 3.0 + 4.0));
      float dens = smoothstep(0.22, 0.5, band) * (0.55 + 0.45 * fine);
      dens *= smoothstep(1.32, 1.42, rr) * smoothstep(2.3, 2.12, rr);
      float3 P = float3(q.x, q.y, (q.y / 0.27) * 0.963);
      float3 Lq = float3(uL.x * 0.9397 + uL.y * 0.342, -uL.x * 0.342 + uL.y * 0.9397, uL.z);
      float b = dot(P, Lq);
      float shadow = (b < 0.0 && length(P - b * Lq) < 0.98) ? 1.0 : 0.0;
      if (dens > dth * 0.8 + 0.12) {
        ringOn = 1.0;
        ringFront = step(0.0, q.y);
        float lvl = 2.2 + band * 2.2 - shadow * 2.6;
        ringC = pick(clamp(floor(lvl + dth * 0.6), 0.0, 4.0));
      }
    }
  }

  if (r2 < 1.0) {
    float z = sqrt(1.0 - r2);
    float3 N = float3(n2.x, n2.y, z);
    float3 T = float3(N.x * 0.9397 - N.y * 0.342, N.x * 0.342 + N.y * 0.9397, N.z);
    float cr = cos(uRot);
    float sr = sin(uRot);
    float3 S = float3(T.x * cr + T.z * sr, T.y, -T.x * sr + T.z * cr);
    float3 sp = S + float3(uSeed * 1.7, uSeed * 2.3, uSeed * 0.9);
    float alb = 0.5;
    float feat = 0.0;
    float glow = 0.0;
    /*KIND*/
    alb = clamp(alb, 0.0, 1.0);
    float light = clamp(dot(N, uL) * 1.2 + 0.1, 0.0, 1.0);
    float a = floor(1.0 + alb * 3.3 + (dth - 0.5) * 0.35 + 0.5);
    float idx = a - floor((1.0 - light) * 3.7 + dth);
    // thin atmosphere scatters light at the lit limb
    idx += step(dth, (0.42 - z) * 2.6 * uAtmo) * step(0.5, light);
    idx = clamp(idx, 0.0, 4.0);
    if (feat > 0.5 && (light > 0.3 || glow > 0.5)) { idx = glow > 0.5 && glow < 0.8 ? 4.0 : 5.0; }
    base = pick(idx);
    alpha = 1.0;
    if (glow > 0.3) { emis = (glow > 0.8 ? uRamp[5] : uRamp[4]) * glow * (glow > 0.5 ? 1.0 : light); }
    if (ringOn > 0.5 && ringFront > 0.5) { base = ringC; emis = float3(0.0); }
  } else {
    float r = sqrt(r2);
    if (ringOn > 0.5) {
      base = ringC;
      alpha = 1.0;
    }
    float halo = (1.0 - (r - 1.0) * uR / 3.2) * uAtmo;
    float2 ld = normalize(uL.xy);
    float lit = clamp(dot(n2 / r, ld) * 1.4 + 0.45, 0.0, 1.0);
    halo *= lit;
    if (halo > dth * 0.85 + 0.12 && ringFront < 0.5) {
      base = halo > 0.62 ? uRamp[4] : uRamp[3];
      alpha = 1.0;
      emis = base * 0.55;
    }
  }
  if (uPass > 0.5) {
    float e = max(emis.r, max(emis.g, emis.b));
    return e > 0.02 ? half4(emis, 1.0) : half4(0.0);
  }
  return half4(base * alpha, alpha);
}`;

// Final upscale on the on-screen canvas (the only full-resolution pass): nearest sampling at
// texel centres, a faint LCD cell grid and a vignette.
// uScale(1) uOff(2) uSize(2) uCell(1) uGrid(1) uVig(1) = 8 floats
const UPSCALE = `
uniform shader img;
uniform float uScale;
uniform float2 uOff;
uniform float2 uSize;
uniform float uCell;
uniform float uGrid;
uniform float uVig;
half4 main(float2 xy) {
  float2 ip = (xy - uOff) / uScale;
  float2 cell = floor(ip);
  half4 c = img.eval(cell + 0.5);
  float2 f = fract(ip);
  float line = max(step(1.0 - uCell, f.x), step(1.0 - uCell, f.y));
  float3 rgb = c.rgb * (1.0 - uGrid * line);
  float2 v = (xy / uSize - 0.5) * float2(1.0, 1.08);
  float vig = smoothstep(0.78, 0.3, length(v));
  rgb *= 1.0 - uVig * (1.0 - vig);
  return half4(rgb, 1.0);
}`;

function compile(source: string, floats: number, name: string): SkRuntimeEffect | null {
  try {
    const effect = Skia.RuntimeEffect.Make(source);
    if (!effect) return null;
    if (effect.getUniformFloatCount() !== floats) {
      console.warn(`viewport shader ${name}: unexpected uniform layout (${effect.getUniformFloatCount()} != ${floats})`);
      return null;
    }
    return effect;
  } catch (e) {
    console.warn(`viewport shader ${name} failed to compile`, e);
    return null;
  }
}

export const NEBULA_FLOATS = 39;
export const STAR_FLOATS = 21;
export const PLANET_FLOATS = 30;
export const UPSCALE_FLOATS = 8;

export const nebulaEffect = compile(NEBULA, NEBULA_FLOATS, "nebula");
export const starEffect = compile(STAR, STAR_FLOATS, "star");
/** Indexed like SHADER_KINDS (rock, gas, ice, lava, ocean, desert, toxic, crystal). */
export const planetEffects: (SkRuntimeEffect | null)[] = PLANET_KINDS.map((body, kind) =>
  compile(PLANET.replace("/*KIND*/", `{
${body}
    }`).replace("/*CELLS*/", body.includes("cells(") ? PLANET_CELLS : ""), PLANET_FLOATS, `planet ${kind}`)
);
export const upscaleEffect = compile(UPSCALE, UPSCALE_FLOATS, "upscale");
