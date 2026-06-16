import { useEffect, useState } from "react";

export function useAuth() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("v8_token"));

  useEffect(() => {
    if (token) {
      localStorage.setItem("v8_token", token);
    } else {
      localStorage.removeItem("v8_token");
    }
  }, [token]);

  return { token, setToken, isAuthenticated: !!token };
}
