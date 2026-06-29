import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

// A lightweight 2D-canvas water splash overlay.
//
// Unlike `useImageWaterRipple` (a full WebGL height-field sim bound to an
// <img>), this paints over arbitrary content — text, columns — and is meant
// to read as droplets hitting a surface: the cursor leaves a faint ripple
// trail, and entering a target element triggers a splash burst (expanding
// rings + a spray of droplets that arc up and fall under gravity).
//
// Palette is the site yellow + white, drawn additively so overlaps glow.
const YELLOW = [231, 211, 147] // --color-yellow
const WHITE = [239, 239, 239] // --color-white-100

function rgba([r, g, b], a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function setupSplash(scope, opts) {
  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '5',
  })
  if (getComputedStyle(scope).position === 'static') scope.style.position = 'relative'
  scope.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  const rings = [] // expanding stroke circles
  const drops = [] // ballistic droplet particles
  let raf = 0
  let destroyed = false
  let last = { x: 0, y: 0, t: 0 }
  let seed = 0 // deterministic-ish jitter without Math.random reliance

  function rand() {
    // Cheap LCG so we don't depend on Math.random (and it stays varied).
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  function resize() {
    const rect = scope.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
  }

  function addRing(x, y, { maxR, width, color, alpha }) {
    rings.push({ x, y, r: 2, maxR, width, color, alpha, life: 1 })
  }

  function addDrops(x, y, count, power) {
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI / 2 + (rand() - 0.5) * 1.7 // mostly upward
      const speed = power * (0.5 + rand())
      drops.push({
        x,
        y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r: 1.2 + rand() * 2.4,
        life: 1,
        color: rand() > 0.5 ? YELLOW : WHITE,
      })
    }
  }

  // A full splash: concentric rings + a spray of droplets.
  function splash(x, y, power = 1) {
    addRing(x, y, { maxR: 70 * power, width: 2, color: YELLOW, alpha: 0.55 })
    addRing(x, y, { maxR: 46 * power, width: 1.5, color: WHITE, alpha: 0.4 })
    addDrops(x, y, Math.round(9 * power), 4.2 * power)
    startLoop()
  }

  // Faint trailing ripple as the cursor drags across the surface.
  function trail(x, y) {
    addRing(x, y, { maxR: 26, width: 1, color: WHITE, alpha: 0.18 })
    if (rand() > 0.6) addDrops(x, y, 1, 2.2)
    startLoop()
  }

  function render() {
    raf = 0
    if (destroyed) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'lighter'

    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i]
      ring.r += (ring.maxR - ring.r) * 0.08
      ring.life -= 0.02
      if (ring.life <= 0) {
        rings.splice(i, 1)
        continue
      }
      ctx.beginPath()
      ctx.arc(ring.x * dpr, ring.y * dpr, ring.r * dpr, 0, Math.PI * 2)
      ctx.lineWidth = ring.width * dpr
      ctx.strokeStyle = rgba(ring.color, ring.alpha * ring.life)
      ctx.stroke()
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      d.vy += 0.18 // gravity
      d.x += d.vx
      d.y += d.vy
      d.life -= 0.022
      if (d.life <= 0) {
        drops.splice(i, 1)
        continue
      }
      ctx.beginPath()
      ctx.arc(d.x * dpr, d.y * dpr, d.r * dpr, 0, Math.PI * 2)
      ctx.fillStyle = rgba(d.color, 0.7 * d.life)
      ctx.fill()
    }

    ctx.globalCompositeOperation = 'source-over'
    if (rings.length || drops.length) raf = requestAnimationFrame(render)
  }

  function startLoop() {
    if (!raf) raf = requestAnimationFrame(render)
  }

  function localPoint(e) {
    const rect = scope.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onMove(e) {
    const p = localPoint(e)
    const dx = p.x - last.x
    const dy = p.y - last.y
    // Only drop a trail ripple after the cursor has travelled a bit.
    if (dx * dx + dy * dy > 26 * 26) {
      trail(p.x, p.y)
      last = { x: p.x, y: p.y }
    }
  }

  scope.addEventListener('mousemove', onMove)

  // Splash burst when the pointer enters any target element.
  const targets = gsap.utils.toArray(scope.querySelectorAll(opts.selector))
  const onEnter = (e) => {
    const p = localPoint(e)
    splash(p.x, p.y, opts.power)
  }
  targets.forEach((t) => t.addEventListener('mouseenter', onEnter))

  resize()
  const resizeObs = new ResizeObserver(resize)
  resizeObs.observe(scope)

  return {
    splashAt: splash,
    destroy() {
      destroyed = true
      scope.removeEventListener('mousemove', onMove)
      targets.forEach((t) => t.removeEventListener('mouseenter', onEnter))
      resizeObs.disconnect()
      if (raf) cancelAnimationFrame(raf)
      canvas.remove()
    },
  }
}

export function useWaterSplash(scopeRef, options = {}) {
  const { selector = '[data-splash]', power = 1 } = options
  const instanceRef = { current: null }

  useGSAP(
    () => {
      if (!scopeRef.current) return
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const finePointer = window.matchMedia('(pointer: fine)').matches
      if (reducedMotion || !finePointer) return

      const instance = setupSplash(scopeRef.current, { selector, power })
      instanceRef.current = instance
      return () => {
        instance.destroy()
        instanceRef.current = null
      }
    },
    { scope: scopeRef, dependencies: [] }
  )

  return instanceRef
}

export default useWaterSplash
