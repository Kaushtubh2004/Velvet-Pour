import { useGSAP } from '@gsap/react'
import gsap from 'gsap'


const VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const PACK = `
vec2 packU(float v){          // v in [-1,1] -> two bytes in [0,1]
  float s = clamp(v * 0.5 + 0.5, 0.0, 1.0) * 255.0;
  return vec2(floor(s) / 255.0, fract(s));
}
float unpackU(vec2 c){ return (c.x + c.y / 255.0) * 2.0 - 1.0; }
vec4 packHV(float h, float vel){ return vec4(packU(h), packU(vel)); }
`
const FRAG_SIM = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;   // .xy = height, .zw = velocity
uniform vec2  uTexel;       // 1 / simResolution
uniform vec2  uMouse;       // cursor in 0..1 (origin bottom-left)
uniform float uForce;       // disturbance strength this frame
uniform float uRadius;      // disturbance radius
uniform float uDamping;     // 0..1, closer to 1 = longer-lived ripples
uniform float uAspect;      // sim w/h, to keep the splash round
${PACK}
float hAt(vec2 uv){ return unpackU(texture2D(uState, uv).xy); }

void main(){
  vec2 uv = vUv;
  vec4 s = texture2D(uState, uv);
  float h = unpackU(s.xy);
  float vel = unpackU(s.zw);

  float l = hAt(uv - vec2(uTexel.x, 0.0));
  float r = hAt(uv + vec2(uTexel.x, 0.0));
  float d = hAt(uv - vec2(0.0, uTexel.y));
  float u = hAt(uv + vec2(0.0, uTexel.y));

  // Wave equation: accelerate toward the neighbour average, damp, integrate.
  float lap = (l + r + u + d) - 4.0 * h;
  vel += lap * 0.45;
  vel *= uDamping;
  h += vel;

  // Inject the cursor, aspect-corrected so the splash is circular.
  vec2 m = (uv - uMouse) * vec2(uAspect, 1.0);
  h += uForce * smoothstep(uRadius, 0.0, length(m));

  gl_FragColor = packHV(clamp(h, -1.0, 1.0), clamp(vel, -1.0, 1.0));
}
`

// Render: refract the image through the height field + specular sheen.
const FRAG_RENDER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uHeight;
uniform sampler2D uTexture;
uniform vec2  uTexel;        // 1 / simResolution
uniform float uCanvasAspect; // canvas w/h
uniform float uImageAspect;  // image w/h
uniform float uStrength;     // refraction amount
uniform float uChroma;       // rgb split amount
uniform float uHover;        // 0..1 fade, eased by GSAP
${PACK}
float hAt(vec2 uv){ return unpackU(texture2D(uHeight, uv).xy); }

// CSS object-fit: cover mapping for the quad.
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

  // Surface gradient -> normal.
  float hL = hAt(uv - vec2(uTexel.x, 0.0));
  float hR = hAt(uv + vec2(uTexel.x, 0.0));
  float hD = hAt(uv - vec2(0.0, uTexel.y));
  float hU = hAt(uv + vec2(0.0, uTexel.y));
  vec2 grad = vec2(hR - hL, hU - hD);

  // Refract: shift the lookup along the slope.
  vec2 disp = grad * uStrength * uHover;
  float ca = uChroma * uHover;
  vec3 col;
  col.r = texture2D(uTexture, cover(uv + disp * (1.0 + ca))).r;
  col.g = texture2D(uTexture, cover(uv + disp)).g;
  col.b = texture2D(uTexture, cover(uv + disp * (1.0 - ca))).b;
  float a = texture2D(uTexture, cover(uv + disp)).a;

  // Soft specular highlight from the surface normal.
  vec3 normal = normalize(vec3(-grad * 6.0, 1.0));
  vec3 lightDir = normalize(vec3(0.6, 0.7, 1.0));
  float spec = pow(max(dot(normal, lightDir), 0.0), 20.0);
  col += spec * 0.35 * uHover;

  gl_FragColor = vec4(col, a);
}
`

function compileShader(gl, type, src) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[water-ripple] shader compile error:', gl.getShaderInfoLog(shader))
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
    console.warn('[water-ripple] program link error:', gl.getProgramInfoLog(program))
    return null
  }
  return program
}

// A simulation render target: an RGBA8 texture + framebuffer.
function createTarget(gl, w, h) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  // Neutral state (height 0, velocity 0) so the surface starts flat.
  // packU(0) = floor(127.5)/255, fract(127.5) = (0.498039, 0.5).
  gl.clearColor(0.498039, 0.5, 0.498039, 0.5)
  gl.clear(gl.COLOR_BUFFER_BIT)
  return { texture, fbo, w, h }
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
  // after it in the DOM) keeps painting on top of the ripple.
  card.insertBefore(canvas, card.firstChild)

  const fade = { hover: 0 }
  const mouse = { x: 0.5, y: 0.5 }     // smoothed cursor
  const target = { x: 0.5, y: 0.5 }    // raw cursor target
  let last = { x: 0.5, y: 0.5 }        // for speed -> ripple strength
  let force = 0                         // decaying disturbance strength

  let gl = null
  let simProgram = null
  let renderProgram = null
  let simU = null
  let renderU = null
  let simPosLoc = 0
  let renderPosLoc = 0
  let quad = null
  let imageTex = null
  let targetA = null
  let targetB = null
  let simW = 0
  let simH = 0
  let raf = 0
  let hovering = false
  let inited = false // false -> 'failed' | true
  let destroyed = false
  let resizeObs = null

  function makeSimTargets() {
    const rect = card.getBoundingClientRect()
    const aspect = rect.width / Math.max(1, rect.height)
    // Low-res field: cheap to simulate and gives smooth, broad ripples.
    const MAX = 256
    if (aspect >= 1) { simW = MAX; simH = Math.max(1, Math.round(MAX / aspect)) }
    else { simH = MAX; simW = Math.max(1, Math.round(MAX * aspect)) }
    targetA = createTarget(gl, simW, simH)
    targetB = createTarget(gl, simW, simH)
  }

  function initGL() {
    inited = true
    gl =
      canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true }) ||
      canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) { inited = 'failed'; return false }

    simProgram = createProgram(gl, VERT, FRAG_SIM)
    renderProgram = createProgram(gl, VERT, FRAG_RENDER)
    if (!simProgram || !renderProgram) { inited = 'failed'; return false }

    quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    simPosLoc = gl.getAttribLocation(simProgram, 'aPosition')
    renderPosLoc = gl.getAttribLocation(renderProgram, 'aPosition')

    simU = {
      uState: gl.getUniformLocation(simProgram, 'uState'),
      uTexel: gl.getUniformLocation(simProgram, 'uTexel'),
      uMouse: gl.getUniformLocation(simProgram, 'uMouse'),
      uForce: gl.getUniformLocation(simProgram, 'uForce'),
      uRadius: gl.getUniformLocation(simProgram, 'uRadius'),
      uDamping: gl.getUniformLocation(simProgram, 'uDamping'),
      uAspect: gl.getUniformLocation(simProgram, 'uAspect'),
    }
    renderU = {
      uHeight: gl.getUniformLocation(renderProgram, 'uHeight'),
      uTexture: gl.getUniformLocation(renderProgram, 'uTexture'),
      uTexel: gl.getUniformLocation(renderProgram, 'uTexel'),
      uCanvasAspect: gl.getUniformLocation(renderProgram, 'uCanvasAspect'),
      uImageAspect: gl.getUniformLocation(renderProgram, 'uImageAspect'),
      uStrength: gl.getUniformLocation(renderProgram, 'uStrength'),
      uChroma: gl.getUniformLocation(renderProgram, 'uChroma'),
      uHover: gl.getUniformLocation(renderProgram, 'uHover'),
    }

    makeSimTargets()

    imageTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, imageTex)
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
    if (!gl || !imageTex || destroyed) return
    gl.bindTexture(gl.TEXTURE_2D, imageTex)
    if (img.complete && img.naturalWidth) {
      // Same-origin images only — a cross-origin <img> without
      // crossorigin="anonymous" would throw a security error here.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
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
    }
  }

  function drawQuad(posLoc) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  function render() {
    raf = 0
    if (destroyed || !gl) return

    // Smooth the cursor and let the injected force decay each frame.
    mouse.x += (target.x - mouse.x) * 0.18
    mouse.y += (target.y - mouse.y) * 0.18
    force *= 0.92

    // --- 1) Simulation step: read targetA, write targetB (no feedback) ---
    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetB.fbo)
    gl.viewport(0, 0, simW, simH)
    gl.useProgram(simProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, targetA.texture)
    gl.uniform1i(simU.uState, 0)
    gl.uniform2f(simU.uTexel, 1 / simW, 1 / simH)
    gl.uniform2f(simU.uMouse, mouse.x, mouse.y)
    gl.uniform1f(simU.uForce, hovering ? force : force * 0.6)
    gl.uniform1f(simU.uRadius, opts.radius)
    gl.uniform1f(simU.uDamping, opts.damping)
    gl.uniform1f(simU.uAspect, simW / simH)
    drawQuad(simPosLoc)

    // targetB now holds the newest height; swap so it becomes "current".
    const tmp = targetA
    targetA = targetB
    targetB = tmp

    // --- 2) Render to the visible canvas using the height field ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(renderProgram)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, targetA.texture)
    gl.uniform1i(renderU.uHeight, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, imageTex)
    gl.uniform1i(renderU.uTexture, 1)
    gl.uniform2f(renderU.uTexel, 1 / simW, 1 / simH)
    gl.uniform1f(renderU.uCanvasAspect, canvas.width / canvas.height)
    gl.uniform1f(renderU.uImageAspect, img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : canvas.width / canvas.height)
    gl.uniform1f(renderU.uStrength, opts.strength)
    gl.uniform1f(renderU.uChroma, opts.chroma)
    gl.uniform1f(renderU.uHover, fade.hover)
    drawQuad(renderPosLoc)

    // Keep going while hovering or while ripples are still meaningful.
    if (hovering || fade.hover > 0.001 || force > 0.0005) {
      raf = requestAnimationFrame(render)
    } else {
      gsap.to(canvas, { opacity: 0, duration: 0.25, overwrite: true })
    }
  }

  function startLoop() {
    if (raf) return
    raf = requestAnimationFrame(render)
  }

  function onEnter(e) {
    if (inited === false && !initGL()) return
    if (inited === 'failed') return
    hovering = true
    resize()
    if (e) onMove(e)
    mouse.x = target.x
    mouse.y = target.y
    last = { x: target.x, y: target.y }
    force = opts.dropForce // initial plop
    gsap.to(canvas, { opacity: 1, duration: 0.12, overwrite: true })
    gsap.to(fade, { hover: 1, duration: 0.5, ease: 'power2.out', overwrite: true })
    startLoop()
  }

  function onMove(e) {
    const rect = card.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = 1 - (e.clientY - rect.top) / rect.height
    // Faster movement -> stronger disturbance, like dragging through water.
    const dx = nx - last.x
    const dy = ny - last.y
    const speed = Math.sqrt(dx * dx + dy * dy)
    force = Math.min(opts.maxForce, force + speed * opts.moveForce)
    target.x = nx
    target.y = ny
    last = { x: nx, y: ny }
  }

  function onLeave() {
    hovering = false
    gsap.to(fade, { hover: 0, duration: 0.6, ease: 'power2.out', overwrite: true })
    startLoop() // run the loop down, render() hides the canvas at the end
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
      gsap.killTweensOf(fade)
      gsap.killTweensOf(canvas)
      if (gl) {
        const lose = gl.getExtension('WEBGL_lose_context')
        if (lose) lose.loseContext()
      }
      canvas.remove()
    },
  }
}

export function useImageWaterRipple(scopeRef, options = {}) {
  const {
    selector = '.top-grid > div, .bottom-grid > div',
    strength = 0.45,   // refraction amount — how hard the image bends
    chroma = 0.18,     // RGB split along the slope (0 = none)
    damping = 0.985,   // ripple persistence (closer to 1 = longer-lived)
    radius = 0.07,     // disturbance radius in uv
    moveForce = 6.0,   // how much cursor speed feeds the waves
    maxForce = 0.9,    // cap on per-frame disturbance
    dropForce = 0.35,  // initial "plop" when the pointer enters
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
        .map((card) => setupCard(card, { strength, chroma, damping, radius, moveForce, maxForce, dropForce }))
        .filter(Boolean)

      return () => instances.forEach((instance) => instance.destroy())
    },
    { scope: scopeRef, dependencies: [] }
  )
}

export default useImageWaterRipple
