"use client";

import { useRef, useEffect, useState } from "react";
import Image from "next/image";
import { motion, useAnimation, type Easing } from "framer-motion";
import { images } from "@/app/assets/images";

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

const sizeClasses = { sm: "w-16 h-16", md: "w-24 h-24", lg: "w-32 h-32" };

const positionClasses = {
  "top-left": "top-4 left-4",
  "top-right": "top-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "bottom-right": "bottom-4 right-4",
  center: "top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
};

const INITIAL_POSE = { opacity: 0, scale: 0.9, x: 0, y: 0 };

type AnimationType = NonNullable<SnowflakeDecorationProps["animationType"]>;

const DURATIONS: Record<AnimationType, number> = {
  "up-down": 5,
  "left-right": 6,
  diagonal: 6,
  "gentle-sway": 7,
  "vertical-float": 5,
};

const MOTION_VALUES: Record<AnimationType, { x?: number[]; y?: number[] }> = {
  "up-down": { y: [-15, 15] },
  "left-right": { x: [-12, 12] },
  diagonal: { x: [-10, 10], y: [-10, 10] },
  "gentle-sway": { x: [-8, 8], y: [-5, 5] },
  "vertical-float": { y: [-20, 20] },
};

const loopTransition = (delay: number, duration: number) => ({
  repeat: Infinity,
  repeatType: "mirror" as const,
  ease: "easeInOut" as Easing,
  delay,
  duration,
});

const getAnimation = (type: AnimationType, delay: number, opacity: number) => {
  const duration = DURATIONS[type];
  const loop = loopTransition(delay, duration);
  const axes = MOTION_VALUES[type];

  return {
    ...axes,
    opacity,
    scale: 1,
    transition: {
      // opacity and scale settle once — no looping
      opacity: { duration: 0.4, ease: "easeOut" as Easing },
      scale: { duration: 0.4, ease: "easeOut" as Easing },
      // x and y loop independently
      ...(axes.x !== undefined ? { x: loop } : {}),
      ...(axes.y !== undefined ? { y: loop } : {}),
    },
  };
};

export default function SnowflakeDecoration({
  className = "",
  size = "md",
  opacity = 0.1,
  rotation = 0,
  position = "center",
  animationType = "up-down",
  delay = 0,
}: SnowflakeDecorationProps) {
  const ref = useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  const [hasEntered, setHasEntered] = useState(false);
  const isVisible = useRef(false);

  // Keep latest prop values accessible inside the observer without rebuilding it
  const animationTypeRef = useRef(animationType);
  const delayRef = useRef(delay);
  const opacityRef = useRef(opacity);
  animationTypeRef.current = animationType;
  delayRef.current = delay;
  opacityRef.current = opacity;

  // IntersectionObserver: start animation on enter, reset cleanly on exit
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          isVisible.current = true;
          setHasEntered(true);
          controls.set(INITIAL_POSE);
          controls.start(
            getAnimation(animationTypeRef.current, delayRef.current, opacityRef.current),
          );
        } else {
          isVisible.current = false;
          controls.stop();
          controls.set(INITIAL_POSE);
        }
      },
      { rootMargin: "100px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // Intentionally not listing animationType/delay/opacity here — prop changes handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  // Restart animation when props change while the element is visible
  useEffect(() => {
    if (!isVisible.current) return;
    controls.set(INITIAL_POSE);
    controls.start(getAnimation(animationType, delay, opacity));
  }, [animationType, controls, delay, opacity]);

  return (
    <motion.div
      ref={ref}
      className={`absolute ${positionClasses[position]} ${sizeClasses[size]} pointer-events-none ${className}`}
      initial={INITIAL_POSE}
      animate={controls}
      style={{ filter: "invert(0.2)", rotate: rotation }}
    >
      {hasEntered && (
        <Image
          src={images.svgs.snowflake}
          alt=""
          aria-hidden
          fill
          className="object-contain"
        />
      )}
    </motion.div>
  );
}
