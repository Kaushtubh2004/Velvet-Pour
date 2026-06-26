import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

/* ------------------------------------------------------------------ *
 * useImageHoverDistortion
 *
 * Obys-style liquid image distortion on hover, done with a raw WebGL
 * fragment shader (no Three.js). For each matched card it overlays a
 * <canvas> on the card's <img>; the canvas is invisible at rest and
 * only renders while hovered. The shader applies, scaled by a GSAP-
 * eased `uHover` value:
 *   - a zoom toward the cursor (your old scale + parallax, in-shader)
 *   - a flowing simplex-noise displacement
 *   - a ripple radiating from the cursor
 *   - a subtle chromatic (RGB) split
 *
 * Bails out cleanly on touch devices and for prefers-reduced-motion,
 * leaving the plain <img> untouched.
 *
 * Usage:
 *   useImageHoverDistortion(sectionRef, {
 *     selector: '.top-grid > div, .bottom-grid > div',
 *   })
 *
 * `selector` must match the CARD elements (each containing one <img>),
 * not the images themselves — the canvas is appended to the card.
 * ------------------------------------------------------------------ */

const VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTexture;
uniform float uHover;        // 0..1, eased by GSAP
uniform float uTime;         // seconds
uniform vec2  uMouse;        // cursor in 0..1 uv space (origin bottom-left)
uniform float uCanvasAspect; // canvas w/h
uniform float uImageAspect;  // image w/h
uniform float uZoom;         // sampling scale at full hover (1/magnification)
uniform float uStrength;     // displacement amount
uniform float uChroma;       // rgb split amount

// --- Ashima 2D simplex noise -------------------------------------
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
                          + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                          dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x  = 2.0 * fract(p * C.www) - 1.0;
  vec3 h  = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Map the full quad onto a centered, cropped region of the image so it
// behaves like CSS object-fit: cover, whatever the box aspect is.
vec2 cover(vec2 uv){
  vec2 r = uv;
  if (uCanvasAspect > uImageAspect) {
    r.y = (uv.y - 0.5) * (uImageAspect / uCanvasAspect) + 0.5;
  } else {
    r.x = (uv.x - 0.5) * (uCanvasAspect / uImageAspect) + 0.5;
  }
  return r;
}

void main(){
  vec2 uv = vUv;

  // Zoom toward a point biased to the cursor (= your old scale + parallax).
  vec2 focus = mix(vec2(0.5), uMouse, 0.35);
  float zoom = mix(1.0, uZoom, uHover);
  uv = (uv - focus) * zoom + focus;

  // Flowing liquid displacement.
  float t = uTime * 0.25;
  vec2 nUv = uv * 2.5;
  vec2 disp;
  disp.x = snoise(nUv + vec2(t, 0.0));
  disp.y = snoise(nUv + vec2(0.0, t) + 31.4);

  // Ripple emanating from the cursor.
  float d = distance(uv, uMouse);
  float ripple = sin(d * 18.0 - uTime * 3.5) * exp(-d * 4.5);
  vec2 dir = (uv - uMouse) / (d + 1e-4);
  disp += dir * ripple * 0.8;

  // Calm the displacement near the edges so the borders don't smear.
  float edge = smoothstep(0.0, 0.18, uv.x) * smoothstep(1.0, 0.82, uv.x)
             * smoothstep(0.0, 0.18, uv.y) * smoothstep(1.0, 0.82, uv.y);
  disp *= mix(0.35, 1.0, edge);

  vec2 w = uv + disp * uStrength * uHover;

  // Chromatic split scales with hover.
  float ca = uHover * uChroma;
  vec3 col;
  col.r = texture2D(uTexture, cover(w + vec2(ca, 0.0))).r;
  col.g = texture2D(uTexture, cover(w)).g;
  col.b = texture2D(uTexture, cover(w - vec2(ca, 0.0))).b;
  float a = texture2D(uTexture, cover(w)).a;

  gl_FragColor = vec4(col, a);
}
`

function compileShader(gl, type, src) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[hover-distortion] shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl, vertSrc, fragSrc) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  if (!vert || !frag) return null
  const program = gl.createProgram()
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[hover-distortion] program link error:', gl.getProgramInfoLog(program))
    return null
  }
  return program
}

function setupCard(card, opts) {
  const img = card.querySelector('img')
  if (!img) return null

  // Card must clip and establish a positioning context for the canvas.
  if (getComputedStyle(card).position === 'static') card.style.position = 'relative'
  card.style.overflow = 'hidden'

  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    opacity: '0',
    pointerEvents: 'none',
    willChange: 'opacity',
    zIndex: '1',
  })
  // Insert FIRST so a positioned `.noisy` grain overlay (which comes
  // after it in the DOM) keeps painting on top of the distortion.
  card.insertBefore(canvas, card.firstChild)

  const state = { hover: 0 }
  const mouse = { x: 0.5, y: 0.5 }
  const target = { x: 0.5, y: 0.5 }

  let gl = null
  let program = null
  let uniforms = null
  let texture = null
  let raf = 0
  let hovering = false
  let inited = false // false -> 'failed' | true
  let destroyed = false
  let resizeObs = null
  const startTime = performance.now()

  function initGL() {
    inited = true
    gl =
      canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true }) ||
      canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) { inited = 'failed'; return false }

    program = createProgram(gl, VERT, FRAG)
    if (!program) { inited = 'failed'; return false }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(program, 'aPosition')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    uniforms = {
      uTexture: gl.getUniformLocation(program, 'uTexture'),
      uHover: gl.getUniformLocation(program, 'uHover'),
      uTime: gl.getUniformLocation(program, 'uTime'),
      uMouse: gl.getUniformLocation(program, 'uMouse'),
      uCanvasAspect: gl.getUniformLocation(program, 'uCanvasAspect'),
      uImageAspect: gl.getUniformLocation(program, 'uImageAspect'),
      uZoom: gl.getUniformLocation(program, 'uZoom'),
      uStrength: gl.getUniformLocation(program, 'uStrength'),
      uChroma: gl.getUniformLocation(program, 'uChroma'),
    }

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    // Constant uniforms.
    gl.uniform1i(uniforms.uTexture, 0)
    gl.uniform1f(uniforms.uHover, 0)
    gl.uniform2f(uniforms.uMouse, 0.5, 0.5)
    gl.uniform1f(uniforms.uZoom, 1 / opts.zoom)
    gl.uniform1f(uniforms.uStrength, opts.strength)
    gl.uniform1f(uniforms.uChroma, opts.chroma)

    texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    uploadTexture()
    resize()
    return true
  }

  function uploadTexture() {
    if (!gl || !texture || destroyed) return
    gl.useProgram(program)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    if (img.complete && img.naturalWidth) {
      // Same-origin images only — a cross-origin <img> without
      // crossorigin="anonymous" will throw a security error here.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.uniform1f(uniforms.uImageAspect, img.naturalWidth / img.naturalHeight)
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
      img.addEventListener('load', () => { if (!destroyed) uploadTexture() }, { once: true })
    }
  }

  function resize() {
    const rect = card.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      if (gl) {
        gl.viewport(0, 0, w, h)
        gl.useProgram(program)
        gl.uniform1f(uniforms.uCanvasAspect, w / h)
      }
    }
  }

  function render() {
    raf = 0
    if (destroyed || !gl) return

    const t = (performance.now() - startTime) / 1000
    mouse.x += (target.x - mouse.x) * 0.12
    mouse.y += (target.y - mouse.y) * 0.12

    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1f(uniforms.uTime, t)
    gl.uniform1f(uniforms.uHover, state.hover)
    gl.uniform2f(uniforms.uMouse, mouse.x, mouse.y)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    if (hovering || state.hover > 0.001) {
      raf = requestAnimationFrame(render)
    } else {
      // Fully reset: hide the canvas and let the loop stay parked.
      gsap.to(canvas, { opacity: 0, duration: 0.2, overwrite: true })
    }
  }

  function startLoop() {
    if (raf) return
    raf = requestAnimationFrame(render)
  }

  function onEnter() {
    if (inited === false && !initGL()) return
    if (inited === 'failed') return
    hovering = true
    resize()
    gsap.to(canvas, { opacity: 1, duration: 0.12, overwrite: true })
    gsap.to(state, { hover: 1, duration: 0.7, ease: 'power2.out', overwrite: true })
    startLoop()
  }

  function onMove(e) {
    const rect = card.getBoundingClientRect()
    target.x = (e.clientX - rect.left) / rect.width
    target.y = 1 - (e.clientY - rect.top) / rect.height
  }

  function onLeave() {
    hovering = false
    gsap.to(state, { hover: 0, duration: 0.6, ease: 'power2.out', overwrite: true })
    startLoop() // run the loop down to zero, render() hides the canvas at the end
  }

  card.addEventListener('mouseenter', onEnter)
  card.addEventListener('mousemove', onMove)
  card.addEventListener('mouseleave', onLeave)

  resizeObs = new ResizeObserver(() => resize())
  resizeObs.observe(card)

  return {
    destroy() {
      destroyed = true
      card.removeEventListener('mouseenter', onEnter)
      card.removeEventListener('mousemove', onMove)
      card.removeEventListener('mouseleave', onLeave)
      if (resizeObs) resizeObs.disconnect()
      if (raf) cancelAnimationFrame(raf)
      gsap.killTweensOf(state)
      gsap.killTweensOf(canvas)
      if (gl) {
        const lose = gl.getExtension('WEBGL_lose_context')
        if (lose) lose.loseContext()
      }
      canvas.remove()
    },
  }
}

export function useImageHoverDistortion(scopeRef, options = {}) {
  const {
    selector = '.top-grid > div, .bottom-grid > div',
    zoom = 1.12,      // hover magnification (matches your old scale: 1.12)
    strength = 0.045, // displacement amount — raise for a wilder warp
    chroma = 0.015,   // RGB split — set to 0 for none
  } = options

  useGSAP(
    () => {
      if (!scopeRef.current) return

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const finePointer = window.matchMedia('(pointer: fine)').matches
      // Touch / reduced-motion: leave the plain <img>, do nothing.
      if (reducedMotion || !finePointer) return

      const cards = gsap.utils.toArray(scopeRef.current.querySelectorAll(selector))
      const instances = cards
        .map((card) => setupCard(card, { zoom, strength, chroma }))
        .filter(Boolean)

      return () => instances.forEach((instance) => instance.destroy())
    },
    { scope: scopeRef, dependencies: [] }
  )
}

export default useImageHoverDistortion