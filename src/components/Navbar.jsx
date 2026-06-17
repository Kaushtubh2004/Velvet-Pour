import React, { useRef } from "react";
import { navLinks } from "../constants";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

const Navbar = () => {
  const navRef = useRef(null);

  useGSAP(() => {
    // Navbar background animation on scroll
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

    // Hover animation for links
    const links = gsap.utils.toArray(".nav-link");

    links.forEach((link) => {
      link.addEventListener("mouseenter", () => {
        gsap.to(link, {
          y: -3,
          scale: 1.08,
          color: "#f59e0b",
          duration: 0.3,
          ease: "power2.out",
        });
      });

      link.addEventListener("mouseleave", () => {
        gsap.to(link, {
          y: 0,
          scale: 1,
          color: "#ffffff",
          duration: 0.3,
          ease: "power2.out",
        });
      });
    });
  });

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
                className="nav-link text-white transition-colors"
              >
                {link.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;