import React, { useRef } from "react";
import { navLinks } from "../constants";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

const Navbar = () => {
  const navRef = useRef(null);

  useGSAP(() => {
    gsap.fromTo(
      navRef.current,
      {
        backgroundColor: "transparent",
      },
      {
        backgroundColor: "rgba(0,0,0,0.3)",
        backdropFilter: "blur(10px)",
        duration: 1,
        ease: "power1.inOut",
        scrollTrigger: {
          trigger: navRef.current,
          start: "bottom top",
        },
      }
    );
  });

  // nav link animation on hover
  useGSAP(() => {
    const links = document.querySelectorAll(".nav-link");

    links.forEach((link) => {
      const letters = link.querySelectorAll(".letter");

      link.addEventListener("mouseenter", () => {
        gsap.fromTo(
          letters,
          {
            y: "100%",
          },
          {
            y: "0%",
            stagger: 0.03,
            duration: 0.5,
            ease: "power4.out",
          }
        );
      });
    });
  }, []);

  return (
    <nav ref={navRef} className="fixed top-0 left-0 w-full z-50">
      <div className="flex items-center justify-between px-8 py-4">
        <a href="#home" className="flex items-center gap-2">
          <img src="/images/logo.png" alt="Logo" className="w-10 h-10" />
          <p className="text-white font-semibold">Velvet Pour</p>
        </a>

        <ul className="flex items-center gap-8">
          {navLinks.map((link) => (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                className="nav-link text-white overflow-hidden inline-block"
              >
                {link.title.split("").map((char, index) => (
                  <span
                    key={index}
                    className="letter inline-block"
                  >
                    {char === " " ? "\u00A0" : char}
                  </span>
                ))}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;