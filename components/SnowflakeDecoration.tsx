"use client";

import Image from "next/image";
import { motion } from "framer-motion";

interface SnowflakeDecorationProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  opacity?: number;
  rotation?: number;
  position?:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "center";
  animationType?:
    | "up-down"
    | "left-right"
    | "diagonal"
    | "gentle-sway"
    | "vertical-float";
  delay?: number;
}

export default function SnowflakeDecoration({
  className = "",
  size = "md",
  opacity = 0.1,
  rotation = 0,
  position = "center",
  animationType = "up-down",
  delay = 0,
}: SnowflakeDecorationProps) {
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
  };

  const positionClasses = {
    "top-left": "top-4 left-4",
    "top-right": "top-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "bottom-right": "bottom-4 right-4",
    center: "top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
  };

  const animations = {
    "up-down": {
      y: [-15, 15],
      transition: {
        duration: 5,
        repeat: Infinity,
        repeatType: "mirror", // smooth back & forth
        ease: "easeInOut",
        delay,
      },
    },
    "left-right": {
      x: [-12, 12],
      transition: {
        duration: 6,
        repeat: Infinity,
        repeatType: "mirror",
        ease: "easeInOut",
        delay,
      },
    },
    diagonal: {
      x: [-10, 10],
      y: [-10, 10],
      transition: {
        duration: 6,
        repeat: Infinity,
        repeatType: "mirror",
        ease: "easeInOut",
        delay,
      },
    },
    "gentle-sway": {
      x: [-8, 8],
      y: [-5, 5],
      transition: {
        duration: 7,
        repeat: Infinity,
        repeatType: "mirror",
        ease: "easeInOut",
        delay,
      },
    },
    "vertical-float": {
      y: [-20, 20],
      transition: {
        duration: 5,
        repeat: Infinity,
        repeatType: "mirror",
        ease: "easeInOut",
        delay,
      },
    },
  };

  const initialAnimation = {
    opacity: opacity,
    scale: 0.9,
    y: position.includes("top") ? -10 : position.includes("bottom") ? 10 : 0,
    x: position.includes("left") ? -10 : position.includes("right") ? 10 : 0,
  };

  const animateProps = {
    opacity: opacity,
    scale: 1,
    y: 0,
    x: 0,
    ...animations[animationType],
  };

  return (
    <motion.div
      className={`absolute ${positionClasses[position]} ${sizeClasses[size]} pointer-events-none ${className}`}
      initial={initialAnimation}
      animate={animateProps}
      style={{
        filter: "invert(0.2)",
      }}
    >
      <Image
        src="/svgs/christmas_straw.svg"
        alt="Snowflake decoration"
        fill
        className="object-contain"
      />
    </motion.div>
  );
}
