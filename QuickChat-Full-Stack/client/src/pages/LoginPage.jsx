import React, { useContext, useState } from 'react'
import assets from '../assets/assets'
import { AuthContext } from '../../context/AuthContext'

const LoginPage = () => {

  const [currState, setCurrState] = useState("Sign up")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [bio, setBio] = useState("")
  const [isDataSubmitted, setIsDataSubmitted] = useState(false);

  const {login} = useContext(AuthContext)

  const onSubmitHandler = (event)=>{
    event.preventDefault();

    if(currState === 'Sign up' && !isDataSubmitted){
      setIsDataSubmitted(true)
      return;
    }

    login(currState=== "Sign up" ? 'signup' : 'login', {fullName, email, password, bio})
  }

  return (
    <div className='min-h-screen bg-cover bg-center flex items-center justify-center gap-0 sm:justify-evenly max-sm:flex-col backdrop-blur-2xl'>

      {/* -------- left -------- */}
      <img src={assets.logo_big} alt="" className='w-[min(45vw,350px)]'/>

      {/* -------- right -------- */}

     <form
  onSubmit={onSubmitHandler}
  className="border-2 text-white border-gray-500 p-6 flex flex-col gap-6 rounded-lg shadow-lg"
  style={{
    backgroundColor: "rgba(255, 255, 255, 0.3)", 
  }}
>
        <h2 className='font-medium text-2xl flex justify-between items-center'>
          {currState}
          {isDataSubmitted && <img onClick={()=> setIsDataSubmitted(false)} src={assets.arrow_icon} alt="" className='w-5 cursor-pointer'/>
          }
          
         </h2>

        {currState === "Sign up" && !isDataSubmitted && (
          <input onChange={(e)=>setFullName(e.target.value)} value={fullName}
           type="text" className='p-2 border border-gray-500 rounded-md focus:outline-none' placeholder="Full Name" required/>
        )}

        {!isDataSubmitted && (
          <>
          <input onChange={(e)=>setEmail(e.target.value)} value={email}
           type="email" placeholder='Email Address' required className='p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500'/>
          <input onChange={(e)=>setPassword(e.target.value)} value={password}
           type="password" placeholder='Password' required className='p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500'/>
          </>
        )}

        {currState === "Sign up" && isDataSubmitted && (
            <textarea onChange={(e)=>setBio(e.target.value)} value={bio}
             rows={4} className='p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500' placeholder='provide a short bio...' required></textarea>
          )
        }

        <button
  type="submit"
  style={{
    padding: '0.75rem 1.5rem', // equivalent to py-3 px-6
    background: 'linear-gradient(to right, #c084fc, #d8b4fe)', // purple-500 to violet-600
    color: 'white',
    borderRadius: '0.375rem', // rounded-md
    cursor: 'pointer',
    border: 'none', // remove default button border
    fontWeight: '600', // optional, make text semi-bold
  }}
>
  {currState === "Sign up" ? "Create Account" : "Login Now"}
</button>


        <div className='flex items-center gap-2 text-sm text-gray-500'>
          <input type="checkbox" />
          <p>Agree to the terms of use & privacy policy.</p>
        </div>

        <div className='flex flex-col gap-2'>
          {currState === "Sign up" ? (
            <p className='text-sm text-gray-600'>Already have an account? <span onClick={()=>{setCurrState("Login"); setIsDataSubmitted(false)}} className='font-medium text-violet-500 cursor-pointer'>Login here</span></p>
          ) : (
            <p className='text-sm text-gray-600'>Create an account <span onClick={()=> setCurrState("Sign up")} className='font-medium text-violet-500 cursor-pointer'>Click here</span></p>
          )}
        </div>
         
      </form>
    </div>
  )
}

export default LoginPage
