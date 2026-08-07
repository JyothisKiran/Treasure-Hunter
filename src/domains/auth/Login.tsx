import { LoginForm } from "@/components/ui/8bit/blocks/login-form-2"
import { useLogin } from "@/hooks/mutations/useLogin";
import { useNavigate } from "react-router-dom";
import type { LoginFormData } from "./types";


const LoginPage = () => {
  const navigate = useNavigate();
  const loginMutation = useLogin();

  const handleLogin = (formData:LoginFormData) => {
    console.log(formData);
    
  loginMutation.mutate(
    {
      email: formData.email,
      password:formData.password,
    },
    {
      onSuccess: (data) => {
        localStorage.setItem("access", data.access);
        localStorage.setItem("refresh", data.refresh);
        console.log('success');
        
        navigate("/landing");
      },
      onError: (error) => {
        console.error(error);
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
            handleSubmit={(formData) => handleLogin(formData)}
          />
        </div>
    )
}

export default LoginPage
