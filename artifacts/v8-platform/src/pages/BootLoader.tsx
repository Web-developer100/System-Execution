import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const APP_VERSION = "2.0.4";

const BOOT_LOGS = [
  { text: `SYSTEM_KERNEL_V${APP_VERSION} INITIALIZING...`, color: "text-primary" },
  { text: `> AES-256-BIT encryption layer............. [ACTIVE]`, color: "text-primary" },
  { text: `> Loading neural exploitation modules...... [OK]`, color: "text-green-400" },
  { text: `> Proxy daemon spawning..................... [OK]`, color: "text-green-400" },
  { text: `> Connecting to vulnerability database...... [OK]`, color: "text-green-400" },
  { text: `> AI validation layer...................... [ONLINE]`, color: "text-green-400" },
  { text: `> Tool orchestration engine................ [READY]`, color: "text-green-400" },
  { text: `> Anti-forensics module.................... [ARMED]`, color: "text-yellow-400" },
  { text: `> Rate-limiter and proxy rotator........... [ACTIVE]`, color: "text-primary" },
  { text: `PROCESS_LIVE ● KERNEL_LOADED ● SYSTEM_IDLE`, color: "text-primary" },
];

const RANDOM_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*";

function GlitchText({ text }: { text: string }) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    let iteration = 0;
    const timer = setInterval(() => {
      setDisplay(
        text.split("").map((char, idx) => {
          if (idx < iteration) return text[idx] ?? char;
          if (char === " ") return " ";
          return RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)] ?? char;
        }).join("")
      );
      iteration += 2;
      if (iteration >= text.length) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [text]);

  return <span>{display}</span>;
}

export default function BootLoader() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [lines, setLines] = useState<Array<{ text: string; color: string }>>([]);
  const [opacity, setOpacity] = useState(1);
  const [memCounter, setMemCounter] = useState(0);
  const started = useRef(false);
  const locationRef = useRef(setLocation);
  locationRef.current = setLocation;

  useEffect(() => {
    // Already authenticated → skip boot sequence
    if (isAuthenticated) {
      locationRef.current("/dashboard");
      return;
    }

    // Run boot sequence only once
    if (started.current) return;
    started.current = true;

    let index = 0;

    const memTimer = setInterval(() => {
      setMemCounter(prev => prev + Math.floor(Math.random() * 512 + 64));
    }, 80);

    const lineTimer = setInterval(() => {
      if (index < BOOT_LOGS.length) {
        const entry = BOOT_LOGS[index];
        if (entry) setLines(prev => [...prev, entry]);
        index++;
      } else {
        clearInterval(lineTimer);
        clearInterval(memTimer);
        setTimeout(() => {
          setOpacity(0);
          setTimeout(() => locationRef.current("/login"), 600);
        }, 900);
      }
    }, 280);

    return () => {
      clearInterval(lineTimer);
      clearInterval(memTimer);
    };
  }, [isAuthenticated]);

  return (
    <div
      className="h-screen w-full bg-black flex flex-col items-center justify-center crt relative overflow-hidden"
      style={{ opacity, transition: "opacity 0.6s ease" }}
    >
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-primary/5 font-mono text-xs"
            style={{ top: `${(i * 6.25) % 100}%`, left: `${(i * 13.7) % 100}%` }}
          >
            {(0xDEAD + i * 0x41).toString(16).toUpperCase()}
          </div>
        ))}
      </div>

      <div className="w-full max-w-2xl p-8 border border-primary/30 glow-box bg-black/90 z-10">
        <div className="text-primary/40 text-xs font-mono mb-6 flex justify-between border-b border-primary/20 pb-4">
          <span>V8_NEURAL_EXPLOITATION_PLATFORM</span>
          <span className="text-primary glow-text">v{APP_VERSION}</span>
        </div>

        <div className="space-y-1 min-h-[280px]">
          {lines.filter(line => !!line?.color).map((line, i) => (
            <div key={i} className={`font-mono text-sm ${line.color} leading-6`}>
              {i === lines.length - 1 ? <GlitchText text={line.text} /> : line.text}
            </div>
          ))}
          {lines.length < BOOT_LOGS.length && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-3 h-5 bg-primary cursor-blink" />
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-primary/20 flex justify-between text-xs text-primary/40 font-mono">
          <span>MEM_ALLOC: {memCounter.toLocaleString()} KB</span>
          <span>ENCRYPTION: AES-256-BIT</span>
        </div>
      </div>
    </div>
  );
}
