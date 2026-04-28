import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "../lib/api";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        await apiClient.auth.register(email, name || email.split("@")[0], password);
        // Automatically login after register
        const res = await apiClient.auth.login(email, password);
        localStorage.setItem("token", res.access_token);
        const pendingInvite = localStorage.getItem("pendingInviteToken");
        if (pendingInvite) {
          localStorage.removeItem("pendingInviteToken");
        }
        window.location.href = pendingInvite
          ? `/invite?token=${encodeURIComponent(pendingInvite)}`
          : "/";
      } else {
        const res = await apiClient.auth.login(email, password);
        localStorage.setItem("token", res.access_token);
        const pendingInvite = localStorage.getItem("pendingInviteToken");
        if (pendingInvite) {
          localStorage.removeItem("pendingInviteToken");
        }
        window.location.href = pendingInvite
          ? `/invite?token=${encodeURIComponent(pendingInvite)}`
          : "/";
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Split kro</CardTitle>
          <CardDescription>
            {isRegister ? "Create a new account" : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  placeholder="Your Name"
                  required
                  className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                required
                className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                required
                className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
            <Button className="w-full" size="lg" type="submit" disabled={loading}>
              {loading ? "Please wait..." : isRegister ? "Register" : "Sign In"}
            </Button>
            <div className="text-center text-sm">
              <span className="text-gray-500">
                {isRegister ? "Already have an account? " : "Don't have an account? "}
              </span>
              <button
                type="button"
                className="text-blue-600 font-medium hover:underline"
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? "Sign in" : "Register"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
