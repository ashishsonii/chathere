import { createContext, useEffect, useState } from "react";
import axios from 'axios'
import toast from "react-hot-toast";
import { io } from "socket.io-client"


const backendUrl = import.meta.env.VITE_BACKEND_URL;
axios.defaults.baseURL = backendUrl;

export const AuthContext = createContext();

export const AuthProvider = ({ children })=>{

    const [token, setToken] = useState(localStorage.getItem("token"));
    const [authUser, setAuthUser] = useState(() => {
        try {
            const saved = localStorage.getItem("authUser");
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });
    const [onlineUsers, setOnlineUsers] = useState([]);

    // Helper to sync authUser to localStorage
    const updateAuthUser = (user) => {
        setAuthUser(user);
        if (user) {
            localStorage.setItem("authUser", JSON.stringify(user));
        } else {
            localStorage.removeItem("authUser");
        }
    };
    const [socket, setSocket] = useState(null);
    const [isCheckingAuth, setIsCheckingAuth] = useState(!!localStorage.getItem("token"));

    // Check if user is authenticated and if so, set the user data and connect the socket
    const checkAuth = async () => {
        try {
            const storedToken = localStorage.getItem("token");
            if (!storedToken) {
                setIsCheckingAuth(false);
                return;
            }
            const { data } = await axios.get("/api/auth/check");
            if (data.success) {
                updateAuthUser(data.user)
                connectSocket(data.user)
            } else {
                updateAuthUser(null);
            }
        } catch (error) {
            console.log("Auth check failed:", error.message);
            // Only clear auth on strict 401/404 errors, ignore 5xx network hiccups
            if (error.response && (error.response.status === 401 || error.response.status === 404)) {
                updateAuthUser(null);
                localStorage.removeItem("token");
                setToken(null);
            }
        } finally {
            setIsCheckingAuth(false);
        }
    }

// Login function to handle user authentication and socket connection

const login = async (state, credentials)=>{
    try {
        const { data } = await axios.post(`/api/auth/${state}`, credentials);
        if (data.success){
            // Set token FIRST so downstream components can make authenticated requests
            axios.defaults.headers.common["token"] = data.token;
            setToken(data.token);
            localStorage.setItem("token", data.token)
            updateAuthUser(data.userData);
            connectSocket(data.userData);
            toast.success(data.message)
        }else{
            toast.error(data.message)
        }
    } catch (error) {
        toast.error(error.response?.data?.message || error.message)
    }
}

// Logout function to handle user logout and socket disconnection

    const logout = async () =>{
        localStorage.removeItem("token");
        localStorage.removeItem("authUser");
        setToken(null);
        setAuthUser(null);
        setOnlineUsers([]);
        axios.defaults.headers.common["token"] = null;
        toast.success("Logged out successfully")
        socket.disconnect();
    }

    // Update profile function to handle user profile updates

    const updateProfile = async (body)=>{
        try {
            const { data } = await axios.put("/api/auth/update-profile", body);
            if(data.success){
                updateAuthUser(data.user);
                toast.success("Profile updated successfully")
            }
        } catch (error) {
            toast.error(error.response?.data?.message || error.message)
        }
    }

    // Connect socket function to handle socket connection and online users updates
    const connectSocket = (userData)=>{
        if(!userData || socket?.connected) return;
        const newSocket = io(backendUrl, {
            query: {
                userId: userData._id,
            },
            transports: ["websocket"]
        });
        newSocket.connect();
        setSocket(newSocket);

        newSocket.on("getOnlineUsers", (userIds)=>{
            setOnlineUsers(userIds);
        })
    }

    useEffect(()=>{
        if(token){
            axios.defaults.headers.common["token"] = token;
        }
        checkAuth();
    },[])

    const value = {
        axios,
        authUser,
        isCheckingAuth,
        onlineUsers,
        socket,
        login,
        logout,
        updateProfile
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}