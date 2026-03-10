import * as THREE from "three";

export interface ScanRevealUniforms {
	uScanRadius: { value: number };
	uScanOrigin: { value: THREE.Vector3 };
	uScanTime: { value: number };
	uOriginFlash: { value: number };
	uWavefrontColor: { value: THREE.Color };
	uEdgeWidth: { value: number };
	uTransitionWidth: { value: number };
}

export function createScanRevealUniforms(): ScanRevealUniforms {
	return {
		uScanRadius: { value: 0 },
		uScanOrigin: { value: new THREE.Vector3(0, 0, 0) },
		uScanTime: { value: 0 },
		uOriginFlash: { value: 0 },
		uWavefrontColor: { value: new THREE.Color(0x00fff0) },
		uEdgeWidth: { value: 0.4 },
		uTransitionWidth: { value: 2.5 },
	};
}

const VERTEX_PREAMBLE = /* glsl */ `
varying vec3 vScanWorldPosition;
`;

const VERTEX_WORLD_POS = /* glsl */ `
vScanWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_PREAMBLE = /* glsl */ `
uniform float uScanRadius;
uniform vec3  uScanOrigin;
uniform float uScanTime;
uniform float uOriginFlash;
uniform vec3  uWavefrontColor;
uniform float uEdgeWidth;
uniform float uTransitionWidth;
varying vec3  vScanWorldPosition;

float scanHash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float scanNoise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(
      mix(scanHash(i), scanHash(i + vec3(1,0,0)), f.x),
      mix(scanHash(i + vec3(0,1,0)), scanHash(i + vec3(1,1,0)), f.x),
      f.y
    ),
    mix(
      mix(scanHash(i + vec3(0,0,1)), scanHash(i + vec3(1,0,1)), f.x),
      mix(scanHash(i + vec3(0,1,1)), scanHash(i + vec3(1,1,1)), f.x),
      f.y
    ),
    f.z
  );
}
`;

const FRAGMENT_SCAN_REVEAL = /* glsl */ `
{
  float scanDist = length(vScanWorldPosition - uScanOrigin);
  float outerEdge = uScanRadius + uEdgeWidth;

  float flashRadius = uOriginFlash * 1.2;
  bool inFlashZone = uOriginFlash > 0.01 && scanDist < flashRadius;

  if (scanDist > outerEdge && !inFlashZone) discard;

  float innerEdge = uScanRadius - uEdgeWidth;
  float transitionEnd = max(uScanRadius - uTransitionWidth, 0.0);

  float noiseVal = scanNoise3D(vScanWorldPosition * 4.0 + uScanTime * 0.4);
  float fineNoise = scanNoise3D(vScanWorldPosition * 10.0 - uScanTime * 0.2);

  if (!inFlashZone && scanDist > innerEdge) {
    float dissolveThreshold = smoothstep(innerEdge, outerEdge, scanDist);
    if (noiseVal < dissolveThreshold) discard;
  }

  if (inFlashZone && scanDist > outerEdge) {
    float flashFade = 1.0 - smoothstep(0.0, flashRadius, scanDist);
    float flashPulse = 0.6 + 0.4 * sin(uScanTime * 12.0);
    gl_FragColor.rgb = uWavefrontColor * flashFade * flashPulse * 3.0;
    gl_FragColor.a = flashFade * 0.9;
  } else {
    float wavefrontBand = smoothstep(outerEdge, innerEdge, scanDist)
                        * smoothstep(transitionEnd, innerEdge, scanDist);
    float wavefrontPulse = 0.8 + 0.2 * sin(uScanTime * 6.0 + scanDist * 3.0);
    vec3 wavefrontGlow = uWavefrontColor * wavefrontBand * wavefrontPulse * 2.0;

    float revealT = smoothstep(innerEdge, transitionEnd, scanDist);
    float holoFlicker = 0.6 + 0.4 * fineNoise;
    vec3 holoColor = uWavefrontColor * 0.2;

    vec3 baseColor = gl_FragColor.rgb;
    vec3 darkBase = baseColor * 0.15 + holoColor;
    gl_FragColor.rgb = mix(darkBase * holoFlicker, baseColor, revealT) + wavefrontGlow;
    gl_FragColor.a *= mix(0.4, 1.0, revealT);
  }
}
`;

export function injectScanRevealShader(
	material: THREE.Material,
	uniforms: ScanRevealUniforms,
): void {
	const mat = material as THREE.Material & {
		uniforms?: Record<string, { value: unknown }>;
	};

	material.transparent = true;

	mat.onBeforeCompile = (shader) => {
		mat.uniforms = shader.uniforms;

		shader.uniforms.uScanRadius = uniforms.uScanRadius;
		shader.uniforms.uScanOrigin = uniforms.uScanOrigin;
		shader.uniforms.uScanTime = uniforms.uScanTime;
		shader.uniforms.uOriginFlash = uniforms.uOriginFlash;
		shader.uniforms.uWavefrontColor = uniforms.uWavefrontColor;
		shader.uniforms.uEdgeWidth = uniforms.uEdgeWidth;
		shader.uniforms.uTransitionWidth = uniforms.uTransitionWidth;

		shader.vertexShader = shader.vertexShader.replace(
			"#include <common>",
			`#include <common>\n${VERTEX_PREAMBLE}`,
		);

		shader.vertexShader = shader.vertexShader.replace(
			"#include <begin_vertex>",
			`#include <begin_vertex>\n${VERTEX_WORLD_POS}`,
		);

		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <common>",
			`#include <common>\n${FRAGMENT_PREAMBLE}`,
		);

		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <dithering_fragment>",
			`${FRAGMENT_SCAN_REVEAL}\n#include <dithering_fragment>`,
		);
	};

	mat.needsUpdate = true;
}
