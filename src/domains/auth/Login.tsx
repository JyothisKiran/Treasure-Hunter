import { LoginForm } from "@/components/ui/8bit/blocks/login-form-2"
import { useLogin } from "@/hooks/mutations/useLogin";
import { useNavigate } from "react-router-dom";
import type { LoginFormData } from "./types";
import { toast } from "@/components/ui/8bit/toast";
import { setTokens } from "@/lib/auth";


const LoginPage = () => {
  const navigate = useNavigate();
  const loginMutation = useLogin();

  const handleLogin = (formData:LoginFormData) => {
  loginMutation.mutate(
    {
      email: formData.email,
      password:formData.password,
    },
    {
      onSuccess: (data) => {
        setTokens(data);
        navigate("/landing");
      },
      onError: (error) => {            
        const message =
          error.response?.data?.detail ??
          error.response?.data?.non_field_errors?.[0] ??
          "Login failed. Please try again.";

        toast(message);
      },
    }
  );
};

    return(
        <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-8">
          <LoginForm
            title1="Welcome Back"
            subtitle="Login with your Codelynks account"
            navLinkText="Sign Up"
            navLink={() => navigate("/signup")}
            formButtonText="Login"
            isSubmitting={loginMutation.isPending}
            handleSubmit={(formData) => handleLogin(formData)}
          />
        </div>
    )
}

export default LoginPage
