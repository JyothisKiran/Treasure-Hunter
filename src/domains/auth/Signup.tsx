import { LoginForm } from "@/components/ui/8bit/blocks/login-form-2"
import { useSignup } from "@/hooks/mutations/useSignup";
import { useNavigate } from "react-router-dom"
import type { SignupFormData } from "./types";
import { toast } from "@/components/ui/8bit/toast";


const SignUp = () => {
    const navigate = useNavigate()
    const signupMutation = useSignup();
    const handleSignUp = (formData:SignupFormData) => {   
      if (formData.password !== formData.confirmPassword) {
        toast("Passwords do not match");
        return;
      }
      signupMutation.mutate(
        {
          email: formData.email,
          password:formData.password,
          re_password: formData.confirmPassword,
        },
        {
          onSuccess: () => {
            navigate("/login");
          },
          onError: (error) => {            
          const message =
            error.response?.data?.email?.[0] ??
            error.response?.data?.password?.[0] ??
            error.response?.data?.re_password?.[0] ??
            error.response?.data?.detail ??
            error.response?.data?.non_field_errors?.[0] ??
            "Signup failed. Please try again.";

          toast(message);
        },
        }
      );
    };
    return(
        <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-8">
          <LoginForm
            title1="Sign Up"
            subtitle="Signup with your Codelynks account"
            formButtonText="Sign Up"
            confirmPassword
            onSubmit={() => navigate('/login')}
            handleSubmit={(formData) => handleSignUp(formData)}
          />
        </div>
    )
}

export default SignUp
