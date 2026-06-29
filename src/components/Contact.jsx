import { useRef } from 'react'
import { openingHours, socials } from '../constants/index.js'
import { useGSAP } from '@gsap/react'
import { SplitText } from 'gsap/all'
import gsap from 'gsap'
import { useWaterSplash } from './useWaterSplash.js'

const Contact = () => {
  const sectionRef = useRef(null)

  // Water splash overlay: cursor leaves a ripple trail, columns splash on enter.
  useWaterSplash(sectionRef, { selector: '.info-col', power: 1 })

  useGSAP(() => {
    const titleSplit = SplitText.create('#contact h2', { type: 'words' })

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: '#contact',
        start: 'top center',
      },
      ease: 'power1.inOut',
    })

    timeline
      .from(titleSplit.words, {
        opacity: 0,
        yPercent: 100,
        stagger: 0.02,
      })
      .from('#contact h3, #contact p', {
        opacity: 0,
        yPercent: 100,
        stagger: 0.05,
      })
      .to('#f-right-leaf', { y: '-50', duration: 1, ease: 'power1.inOut' })
      .to('#f-left-leaf', { y: '-50', duration: 1, ease: 'power1.inOut' }, '<')
  }, { scope: sectionRef })

  // Per-character "water wave" hover: a ripple of letters lifts and flushes
  // yellow as it travels across the line, then settles back.
  useGSAP(() => {
    const lines = gsap.utils.toArray('#contact .wave-text')
    const cleanups = lines.map((line) => {
      const split = SplitText.create(line, { type: 'chars' })
      const chars = split.chars

      const enter = () => {
        // Headings are already yellow, so flush each letter to white as the
        // wave passes — a visible shimmer that yoyos back to yellow.
        gsap.to(chars, {
          yPercent: -45,
          color: '#ffffff',
          duration: 0.4,
          ease: 'sine.inOut',
          stagger: { each: 0.03, from: 'start', yoyo: true, repeat: 1 },
          overwrite: 'auto',
        })
      }

      line.addEventListener('mouseenter', enter)
      return () => {
        line.removeEventListener('mouseenter', enter)
        split.revert()
      }
    })

    return () => cleanups.forEach((fn) => fn())
  }, { scope: sectionRef })

  return (
    <footer id="contact" ref={sectionRef}>
      <img src="/images/footer-right-leaf.png" alt="leaf-right" id="f-right-leaf" />
      <img src="/images/footer-left-leaf.png" alt="leaf-left" id="f-left-leaf" />

      <div className="content">
        <h2>Where to Find Us</h2>

        <div className="info-grid">
          <div className="info-col">
            <div className="info-block">
              <h3 className="wave-text">Visit Our Bar</h3>
              <p>House No: 230, Sector-63, Noida</p>
            </div>

            <div className="info-block">
              <h3 className="wave-text">Contact Us</h3>
              <p>(+91) 79XXXXXXXX</p>
              <p>VelvetPour@gmail.com</p>
            </div>
          </div>

          <div className="info-col">
            <div className="info-block">
              <h3 className="wave-text">Open Every Day</h3>
              {openingHours.map((time) => (
                <p key={time.day}>
                  {time.day} : {time.time}
                </p>
              ))}
            </div>

            <div className="info-block">
              <h3 className="wave-text">Socials</h3>

              <div className="flex-center gap-5">
                {socials.map((social) => (
                  <a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.name}
                  >
                    <img src={social.icon} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Contact
