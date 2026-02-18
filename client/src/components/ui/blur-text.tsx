import { LazyMotion, domAnimation, m, useInView } from "framer-motion";
import { useRef, useMemo } from "react";

interface BlurTextProps {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  rootMargin?: string;
  onAnimationComplete?: () => void;
  stepDuration?: number;
}

export function BlurText({
  text = "",
  delay = 200,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  onAnimationComplete,
  stepDuration = 0.35,
}: BlurTextProps) {
  const elements =
    animateBy === "words" ? text.split(" ") : text.split("");
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: threshold, margin: rootMargin as any });

  const defaultFrom = useMemo(
    () =>
      direction === "top"
        ? { filter: "blur(10px)", opacity: 0, y: -30 }
        : { filter: "blur(10px)", opacity: 0, y: 30 },
    [direction]
  );

  const defaultTo = useMemo(
    () => ({ filter: "blur(0px)", opacity: 1, y: 0 }),
    []
  );

  return (
    <LazyMotion features={domAnimation}>
      <span ref={ref} className="inline-flex flex-wrap justify-center">
        {elements.map((segment, index) => (
          <m.span
            key={`${segment}-${index}`}
            className={className}
            initial={defaultFrom}
            animate={inView ? defaultTo : defaultFrom}
            transition={{
              duration: stepDuration,
              delay: (index * delay) / 1000,
              ease: "easeOut",
            }}
            onAnimationComplete={
              index === elements.length - 1 ? onAnimationComplete : undefined
            }
            style={{ display: "inline-block" }}
          >
            {segment === " " ? "\u00A0" : segment}
            {animateBy === "words" && index < elements.length - 1 && "\u00A0"}
          </m.span>
        ))}
      </span>
    </LazyMotion>
  );
}

export default BlurText;
