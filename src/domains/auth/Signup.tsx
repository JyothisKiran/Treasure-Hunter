import { LoginForm } from "@/components/ui/8bit/blocks/login-form-2"
import { useSignup } from "@/hooks/mutations/useSignup";
import { useNavigate } from "react-router-dom"
import type { SignupFormData } from "./types";


const SignUp = () => {
    const navigate = useNavigate()
    const signupMutation = useSignup();
    const handleSignUp = (formData:SignupFormData) => {    
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
            console.error(error);
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
