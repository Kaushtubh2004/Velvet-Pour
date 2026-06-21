import { useEffect, useRef } from "react";
import gsap from "gsap";

const CursorTracker = () => {
  const cursorRef = useRef(null);

  useEffect(() => {
    const cursor = cursorRef.current;

    gsap.set(cursor, {
      xPercent: -50,
      yPercent: -50,
    });

    const xTo = gsap.quickTo(cursor, "x", {
      duration: 0.4,
      ease: "power3.out",
    });

    const yTo = gsap.quickTo(cursor, "y", {
      duration: 0.4,
      ease: "power3.out",
    });

    const handleMouseMove = (e) => {
      xTo(e.clientX);
      yTo(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-8 w-8 rounded-full border border-white mix-blend-difference"
    />
  );
};

export default CursorTracker;