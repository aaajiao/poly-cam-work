import * as THREE from "three";

import type { ScanRevealUniforms } from "./scanRevealMesh";

const vertexShader = /* glsl */ `
uniform float uScanRadius;
uniform vec3  uScanOrigin;
uniform float uScanTime;
uniform float uOriginFlash;
uniform vec3  uWavefrontColor;
uniform float uEdgeWidth;
uniform float uTransitionWidth;
uniform float uPointSize;

varying vec3  vColor;
varying float vAlpha;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  float dist = length(worldPos.xyz - uScanOrigin);

  float outerEdge = uScanRadius + uEdgeWidth;
  float innerEdge = uScanRadius - uEdgeWidth;
  float trailEnd = max(uScanRadius - uTransitionWidth, 0.0);

  float flashRadius = uOriginFlash * 1.2;
  bool inFlash = uOriginFlash > 0.01 && dist < flashRadius;

  if (dist > outerEdge && !inFlash) {
    gl_PointSize = 0.0;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vAlpha = 0.0;
    vColor = vec3(0.0);
    return;
  }

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float revealT = smoothstep(innerEdge, trailEnd, dist);

  float wavefrontT = smoothstep(outerEdge, innerEdge, dist);
  float sizePop = mix(1.6, 1.0, wavefrontT);
  float trailSize = mix(1.15, 1.0, revealT);
  gl_PointSize = uPointSize * sizePop * trailSize * (300.0 / -mvPosition.z);

  vec3 wavefrontMix = mix(uWavefrontColor, color, wavefrontT);
  vec3 trailTint = mix(wavefrontMix, color, revealT);
  vColor = trailTint;

  float wavefrontAlpha = mix(0.6, 1.0, wavefrontT);
  vAlpha = mix(wavefrontAlpha, 1.0, revealT);

  if (inFlash && dist > outerEdge) {
    float flashFade = 1.0 - smoothstep(0.0, flashRadius, dist);
    gl_PointSize = uPointSize * 1.8 * (300.0 / -mvPosition.z);
    vColor = uWavefrontColor;
    vAlpha = flashFade * 0.8;
  }
}
`;

const fragmentShader = /* glsl */ `
varying vec3  vColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - 0.5;
  float d = length(center);
  if (d > 0.5) discard;

  float edge = smoothstep(0.5, 0.35, d);
  gl_FragColor = vec4(vColor, vAlpha * edge);
}
`;

export function createScanPointsMaterial(
	uniforms: ScanRevealUniforms,
	pointSize: number,
): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: {
			uScanRadius: uniforms.uScanRadius,
			uScanOrigin: uniforms.uScanOrigin,
			uScanTime: uniforms.uScanTime,
			uOriginFlash: uniforms.uOriginFlash,
			uWavefrontColor: uniforms.uWavefrontColor,
			uEdgeWidth: uniforms.uEdgeWidth,
			uTransitionWidth: uniforms.uTransitionWidth,
			uPointSize: { value: pointSize },
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthWrite: false,
		vertexColors: true,
	});
}
