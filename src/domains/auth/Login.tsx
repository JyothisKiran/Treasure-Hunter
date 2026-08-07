import { LoginForm } from "@/components/ui/8bit/blocks/login-form-2"
import { useNavigate } from "react-router-dom";


const LoginPage = () => {
      const navigate = useNavigate();

    return(
        <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-8">
          <LoginForm
            title1="Welcome Back"
            subtitle="Login with your Codelynks account"
            navLinkText="Sign Up"
            navLink={() => navigate("/signup")}
            formButtonText="Login"
          />
        </div>
    )
}

export default LoginPage
