"use client";

import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { Lock, Loader2 } from "lucide-react";
import { Footer } from "@/components/footer";

export default function ChangePasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) throw new Error("New passwords do not match");
      return apiRequest("POST", "/api/change-password", {
        currentPassword,
        newPassword,
      });
    },
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your password has been updated.",
      });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({
        title: "Change password failed",
        description: err.message ?? "Please check your current password and try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    changePasswordMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-log-green" />
              <CardTitle>Change password</CardTitle>
            </div>
            <CardDescription>
              Enter your current password and choose a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current password</Label>
                <Input
                  id="current"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={changePasswordMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New password</Label>
                <Input
                  id="new"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  disabled={changePasswordMutation.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  At least 8 characters, with uppercase, lowercase, number, and special character.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={changePasswordMutation.isPending}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Change password"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
