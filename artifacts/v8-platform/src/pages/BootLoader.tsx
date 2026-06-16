import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const bootLogs = [
  "SYSTEM_KERNEL_V2.0.4 INITIALIZING...",
  "> Loading neural exploitation modules... [OK]",
  "> AES-256-BIT encryption layer... [ACTIVE]",
  "> Proxy daemon spawning... [OK]",
  "> AI validation layer... [ONLINE]",
  "> Connecting to vulnerability database... [OK]",
  "PROCESS_LIVE ● KERNEL_LOADED"
];

export default function BootLoader() {
  const [, setLocation] = useLocation();
  const [lines, setLines] = useState<string[]>([]);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < bootLogs.length) {
        setLines(prev => [...prev, bootLogs[index]]);
        index++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setOpacity(0);
          setTimeout(() => setLocation("/login"), 500);
        }, 800);
      }
    }, 300);

    return () => clearInterval(interval);
  }, [setLocation]);

  return (
    <div className="h-screen w-full bg-black flex items-center justify-center crt" style={{ opacity, transition: 'opacity 0.5s ease' }}>
      <div className="w-full max-w-2xl p-8 glow-box border border-primary/30 min-h-[300px]">
        {lines.map((line, i) => (
          <div key={i} className="mb-2 text-primary glow-text text-lg">
            {line}
          </div>
        ))}
        {lines.length < bootLogs.length && (
          <div className="w-3 h-5 bg-primary cursor-blink inline-block mt-1"></div>
        )}
      </div>
    </div>
  );
}
