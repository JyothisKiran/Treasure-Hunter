import { LoginForm } from "@/components/ui/8bit/blocks/login-form-2"
import { useNavigate } from "react-router-dom"


const SignUp = () => {
    const navigate = useNavigate()
    return(
        <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-8">
          <LoginForm
            title1="Sign Up"
            subtitle="Signup with your Codelynks account"
            formButtonText="Sign Up"
            confirmPassword
            onSubmit={() => navigate('/login')}
          />
        </div>
    )
}

export default SignUp
