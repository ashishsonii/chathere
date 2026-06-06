import React, { useContext, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import {Toaster} from "react-hot-toast"
import { AuthContext } from '../context/AuthContext'
import IncomingCallOverlay from './components/call/IncomingCallOverlay'
import OutgoingCallOverlay from './components/call/OutgoingCallOverlay'
import VoiceCallScreen from './components/call/VoiceCallScreen'
import VideoCallScreen from './components/call/VideoCallScreen'

const App = () => {
  const { authUser, isCheckingAuth } = useContext(AuthContext)
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
        window.scrollTo(0, 0); // Force scroll to top
      } else {
        setViewportHeight(window.innerHeight);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }
    handleResize();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  if (isCheckingAuth && !authUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1c1630]">
        <div className="relative flex items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-violet-500"></div>
          <div className="absolute text-violet-400 font-bold text-xs select-none">Orry</div>
        </div>
      </div>
    );
  }

  return (
    <div 
      style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
      className="bg-[url('/bgImage.svg')] bg-contain w-full flex flex-col overflow-hidden fixed inset-0"
    >
      <Toaster/>
      <IncomingCallOverlay />
      <OutgoingCallOverlay />
      <VoiceCallScreen />
      <VideoCallScreen />
      <Routes>
        <Route path='/' element={authUser ? <HomePage /> : <Navigate to="/login" />}/>
        <Route path='/login' element={!authUser ? <LoginPage /> : <Navigate to="/" />}/>
        <Route path='/profile' element={authUser ? <ProfilePage /> : <Navigate to="/login" />}/>
      </Routes>
    </div>
  )
}

export default App
