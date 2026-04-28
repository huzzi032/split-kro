import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Moon, Globe, Bell, User, Shield } from "lucide-react";

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState("en");
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c2024]">Settings</h1>
        <p className="mt-1 text-[#60646c]">Manage your preferences and account</p>
      </div>

      {/* Profile */}
      <Card className="border-[#e4e4e9]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-[#1c2024]">
            <User className="h-5 w-5 text-[#0d74ce]" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0d74ce]/10 text-2xl font-bold text-[#0d74ce]">
              {(user?.name ?? "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-semibold text-[#1c2024]">{user?.name ?? "User"}</p>
              <p className="text-sm text-[#60646c]">{user?.email ?? "No email"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card className="border-[#e4e4e9]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-[#1c2024]">
            <Globe className="h-5 w-5 text-[#10b981]" />
            Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Moon className="h-5 w-5 text-[#60646c]" />
              <div>
                <p className="text-sm font-medium text-[#1c2024]">Dark Mode</p>
                <p className="text-xs text-[#60646c]">Toggle dark/light theme</p>
              </div>
            </div>
            <Switch checked={darkMode} onCheckedChange={setDarkMode} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-[#60646c]" />
              <div>
                <p className="text-sm font-medium text-[#1c2024]">Language</p>
                <p className="text-xs text-[#60646c]">Choose your preferred language</p>
              </div>
            </div>
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                toast(e.target.value === "ur" ? "Urdu selected" : "English selected");
              }}
              className="rounded-lg border border-[#e4e4e9] bg-white px-3 py-2 text-sm"
            >
              <option value="en">English</option>
              <option value="ur">Urdu</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-[#60646c]" />
              <div>
                <p className="text-sm font-medium text-[#1c2024]">Notifications</p>
                <p className="text-xs text-[#60646c]">Receive expense and settlement alerts</p>
              </div>
            </div>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="border-[#e4e4e9]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-[#1c2024]">
            <Shield className="h-5 w-5 text-[#ab6400]" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 rounded-lg border-[#e4e4e9] text-[#eb8e90] hover:bg-[#eb8e90]/10 hover:text-[#eb8e90]"
            onClick={logout}
          >
            Log Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
