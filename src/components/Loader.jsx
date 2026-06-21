import React, { useEffect, useRef } from "react";
import gsap from "gsap";

const Loader = ({ onComplete }) => {
    const liquidRef = useRef(null);
    const oliveRef = useRef(null);
    const bubblesRef = useRef([]);
    const ringRef = useRef(null);

    useEffect(() => {
        const tl = gsap.timeline({
            repeat: -1,
            yoyo: true,
        });


        // Liquid
        tl.to(
            liquidRef.current,
            {
                y: 30,
                duration: 1.8,
                ease: "sine.inOut",
            },
            0
        );

        // Olive
        tl.to(
            oliveRef.current,
            {
                y: 30,
                rotation: 8,
                duration: 1.8,
                ease: "sine.inOut",
                transformOrigin: "center center",
            },
            0
        );

        // Circular pulse
        gsap.to(ringRef.current, {
            scale: 1.25,
            opacity: 0.2,
            duration: 2,
            repeat: -1,
            yoyo: true,
            ease: "power1.inOut",
        });


        // Bubbles
        bubblesRef.current.forEach((bubble, index) => {
            gsap.fromTo(
                bubble,
                {
                    y: 0,
                    opacity: 0,
                    scale: 0.5,
                },
                {
                    y: -60,
                    opacity: 1,
                    scale: 1,
                    duration: 1.5 + index * 0.2,
                    repeat: -1,
                    ease: "power1.out",
                    delay: index * 0.3,
                }
            );
        });

        // Hide loader after 4 sec
        const timeout = setTimeout(() => {
            gsap.to(".loader-screen", {
                opacity: 0,
                duration: 0.8,
                onComplete,
            });
        }, 4000);

        return () => clearTimeout(timeout);
    }, [onComplete]);

    return (
        <div className="loader-screen fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
            {/* Background Circle */}
            <div
                ref={ringRef}
                className="absolute h-80 w-80 "
            />

            <svg
                width="100"
                height="150"
                viewBox="0 0 260 320"
                className="relative z-10"
            >
                <defs>
                    <clipPath id="glassClip">
                        <path d="M50 60 L210 60 L130 150 Z" />
                    </clipPath>

                    <filter id="purpleGlow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Liquid */}
                <g clipPath="url(#glassClip)">
                    <rect
                        ref={liquidRef}
                        x="40"
                        y="95"
                        width="180"
                        height="100"
                        fill="rgba(59,130,246,0.35)"
                    />

                    {[0, 1, 2, 3].map((_, i) => (
                        <circle
                            key={i}
                            ref={(el) => (bubblesRef.current[i] = el)}
                            cx={90 + i * 20}
                            cy={130}
                            r={i % 2 === 0 ? 3 : 4}
                            fill="rgba(255,255,255,0.8)"
                        />
                    ))}
                </g>

                {/* Glass */}
                <path
                    d="M50 60 L210 60 L130 150 Z"
                    fill="none"
                    stroke="#c084fc"
                    strokeWidth="3"
                />

                <line
                    x1="130"
                    y1="150"
                    x2="130"
                    y2="245"
                    stroke="#c084fc"
                    strokeWidth="3"
                />

                <line
                    x1="80"
                    y1="245"
                    x2="180"
                    y2="245"
                    stroke="#c084fc"
                    strokeWidth="3"
                    strokeLinecap="round"
                />

                {/* Olive */}
                <g ref={oliveRef}>
                    <line
                        x1="155"
                        y1="87"
                        x2="175"
                        y2="65"
                        stroke="white"
                        strokeWidth="2"
                    />

                    <circle cx="155" cy="95" r="8" fill="#22c55e" />
                    <circle cx="152" cy="92" r="2" fill="#166534" />
                </g>
            </svg>

            {/* Brand */}
            <h1
                className="text-white font-semibold loader-font"
            >
               Velvet Pour
            </h1>

            {/* Loading Dots */}
            {/* Olive Loading Indicator */}
            <div className="mt-5 flex gap-4">
                {[0, 1, 2].map((_, i) => (
                    <div
                        key={i}
                        className="relative animate-bounce"
                        style={{
                            animationDelay: `${i * 0.15}s`,
                        }}
                    >
                        {/* Toothpick */}
                        <div className="absolute -top-1 left-1/2 h-3 w-[1px] -translate-x-1/2 bg-purple-300" />

                        {/* Olive */}
                        <div className="
        h-4
        w-4
        rounded-full
        bg-green-500
        shadow-[0_0_15px_rgba(34,197,94,0.8)]
      ">
                            <div className="absolute left-[6px] top-[6px] h-1 w-1 rounded-full bg-green-900" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Loader;