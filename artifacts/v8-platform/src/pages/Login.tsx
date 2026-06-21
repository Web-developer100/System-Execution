import { flushSync } from "react-dom";
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Key, User, Languages, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const APP_VERSION = "2.0.4";

export default function Login() {
  const [, setLocation] = useLocation();
  const { setToken } = useAuth();
  const { t, lang, toggleLang } = useI18n();
  const { toast } = useToast();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [shake, setShake] = useState(false);

  const loginMut = useLogin();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    loginMut.mutate(
      { data: { username: username.trim(), password } },
      {
        onSuccess: (data) => {
          // flushSync forces React to update state synchronously so
          // isAuthenticated is true BEFORE setLocation triggers re-render
          flushSync(() => {
            setToken(data.token);
          });
          setLocation("/dashboard");
        },
        onError: () => {
          setShake(true);
          setTimeout(() => setShake(false), 600);
          toast({
            title: "ACCESS DENIED",
            description: "Invalid credentials. Authorization rejected.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center p-4 crt relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#00ff41 1px, transparent 1px), linear-gradient(90deg, #00ff41 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Version top-left */}
      <div className="absolute top-4 left-4 text-primary/20 font-mono text-xs uppercase tracking-widest">
        V8_CORE v{APP_VERSION}
      </div>

      {/* Lang toggle */}
      <div className="absolute top-4 right-4 z-20">
        <Button
          variant="outline"
          className="border-primary/30 text-primary/60 hover:bg-primary/10 hover:text-primary rounded-none text-xs uppercase tracking-wider h-9"
          onClick={toggleLang}
        >
          <Languages className="w-3 h-3 mr-1.5" />
          {lang === "ar" ? "EN" : "عر"}
        </Button>
      </div>

      {/* Login Card */}
      <div
        className={`w-full max-w-sm bg-black border border-primary/30 glow-box p-8 z-10 transition-transform ${
          shake ? "animate-shake" : ""
        }`}
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 border-2 border-primary glow-box flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary glow-text" />
          </div>
          <h1 className="text-xl font-bold text-primary tracking-widest glow-text uppercase">
            {t("login.title")}
          </h1>
          <div className="text-xs text-primary/30 font-mono mt-1 tracking-wider uppercase">
            V8_NEURAL_EXPLOITATION_PLATFORM
          </div>
          <div className="w-full h-px bg-primary/20 mt-4">
            <div className="h-[2px] bg-primary w-1/2 mx-auto glow-box" />
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] text-primary/50 uppercase tracking-widest font-mono block">
              {t("login.username")}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="bg-black border-primary/30 text-primary pl-10 h-12 rounded-none focus-visible:ring-primary/50 focus-visible:border-primary font-mono"
                data-testid="input-username"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-primary/50 uppercase tracking-widest font-mono block">
              {t("login.password")}
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="bg-black border-primary/30 text-primary pl-10 h-12 rounded-none focus-visible:ring-primary/50 focus-visible:border-primary font-mono"
                data-testid="input-password"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-primary text-black hover:bg-primary/90 font-bold uppercase tracking-widest glow-box rounded-none text-sm mt-2"
            disabled={loginMut.isPending}
            data-testid="button-login"
          >
            {loginMut.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                INITIALIZING...
              </span>
            ) : (
              t("login.button")
            )}
          </Button>
        </form>

        <div className="mt-8 pt-4 border-t border-primary/10 text-center">
          <div className="text-[10px] text-primary/25 font-mono uppercase tracking-widest">
            {t("login.credit")}
          </div>
          <div className="text-[10px] text-primary/15 font-mono mt-1">
            ENCRYPTION: AES-256-BIT ● SECURE_CHANNEL: ACTIVE
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="absolute bottom-4 w-full flex justify-between px-6 text-[10px] font-mono text-primary/20 uppercase tracking-widest">
        <span>AES_QUANTUM_G</span>
        <span>SYSTEM_KERNEL_V{APP_VERSION}</span>
      </div>
    </div>
  );
}
