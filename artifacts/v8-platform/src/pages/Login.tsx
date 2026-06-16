import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Key, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, setLocation] = useLocation();
  const { setToken } = useAuth();
  const { t, lang, toggleLang } = useI18n();
  const { toast } = useToast();
  
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  
  const loginMut = useLogin();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMut.mutate(
      { data: { username, password } },
      {
        onSuccess: (data) => {
          setToken(data.token);
          setLocation("/dashboard");
        },
        onError: () => {
          toast({
            title: "Access Denied",
            description: "Invalid credentials.",
            variant: "destructive"
          });
        }
      }
    );
  };

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center p-4 crt relative">
      <div className="absolute top-4 right-4 z-20">
        <Button variant="outline" className="border-primary text-primary hover:bg-primary/20 glow-text" onClick={toggleLang}>
          {lang === 'ar' ? 'English' : 'عربي'}
        </Button>
      </div>
      
      <div className="w-full max-w-md bg-card/80 p-8 glow-box border border-primary/30 z-10">
        <div className="flex flex-col items-center mb-8">
          <Shield className="w-16 h-16 text-primary mb-4 glow-text" />
          <h1 className="text-2xl font-bold text-primary tracking-widest text-center glow-text">
            {t('login.title')}
          </h1>
          <div className="w-full h-px bg-primary/30 mt-4 relative">
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] bg-primary glow-box"></div>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-primary/70 text-sm uppercase tracking-wider block">
              {t('login.username')}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
              <Input 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-black border-primary/30 text-primary pl-10 h-12 focus-visible:ring-primary focus-visible:border-primary glow-text"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-primary/70 text-sm uppercase tracking-wider block">
              {t('login.password')}
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
              <Input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-black border-primary/30 text-primary pl-10 h-12 focus-visible:ring-primary focus-visible:border-primary glow-text"
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 bg-primary text-black hover:bg-primary/90 font-bold uppercase tracking-widest glow-box mt-8"
            disabled={loginMut.isPending}
          >
            {loginMut.isPending ? "INITIALIZING..." : t('login.button')}
          </Button>
        </form>

        <div className="mt-8 text-center text-primary/40 text-xs tracking-widest">
          {t('login.credit')}
        </div>
      </div>
    </div>
  );
}
