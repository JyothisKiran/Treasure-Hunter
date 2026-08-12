import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/8bit/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/8bit/card";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { Spinner } from "@/components/ui/8bit/spinner";

import "@/components/ui/8bit/styles/retro.css";
import { useState } from "react";

interface CardProps extends React.ComponentPropsWithoutRef<"div"> {
  title1: string;
  subtitle?: string;
  navLinkText?: string;
  navLink?: () => void;
  formButtonText?: string;
  confirmPassword?: boolean;
  isSubmitting?: boolean;
  handleSubmit: (formData: {
    email: string;
    password: string;
    confirmPassword: string;
  }) => void;
}

export function LoginForm({
  className,
  title1,
  subtitle,
  navLinkText,
  navLink,  
  confirmPassword,
  isSubmitting = false,
  formButtonText,
  handleSubmit,
  ...props
}: CardProps) {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [id]: value,
    }));
  }

  const handleFormSubmit = () => {
    handleSubmit(formData)
  }

  
  return (
    <div className={cn("flex w-full max-w-sm flex-col gap-5", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{title1}</CardTitle>
          <CardDescription className="text-xs">
            {subtitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form autoComplete="off">
            <div className="grid gap-6">
              <div className="grid gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    value={formData.email}
                    onChange={(e) => handleInputChange(e)}
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                  </div>
                  <Input id="password" type="password" required  value={formData.password} onChange={(e) => handleInputChange(e)} autoComplete="off"/>
                </div>
                {confirmPassword && (<div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                  </div>
                  <Input id="confirmPassword" type="password" required value={formData.confirmPassword} onChange={(e) => handleInputChange(e)} autoComplete="off"/>
                </div>)}
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleFormSubmit}
                  disabled={isSubmitting || !formData.email || !formData.password || (confirmPassword && !formData.confirmPassword)}
                  aria-busy={isSubmitting}
                >
                  {isSubmitting && <Spinner variant="diamond" className="size-4" />}
                  {isSubmitting ? "Logging in..." : formButtonText}
                </Button>
              </div>
              {(navLink || navLinkText) && (

              <div className="text-center text-xs">
                Don&apos;t have an account?{" "}
                <div onClick={navLink} className="underline underline-offset-4">
                  {navLinkText}
                </div>
              </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
