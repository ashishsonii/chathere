import { generateToken } from "../lib/utils.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import redis from "../lib/redis.js";
import { uploadToS3, signUser } from "../lib/s3.js";

// Signup a new user
export const signup = async (req, res)=>{
    const { fullName, email, password, bio } = req.body;

    try {
        if (!fullName || !email || !password || !bio){
            return res.json({success: false, message: "Missing Details" })
        }
        const user = await User.findOne({email});

        if(user){
            return res.json({success: false, message: "Account already exists" })
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            fullName, email, password: hashedPassword, bio
        });

        const token = generateToken(newUser._id)

        const signedUser = await signUser(newUser);
        res.json({success: true, userData: signedUser, token, message: "Account created successfully"})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
    }
}

// Controller to login a user
export const login = async (req, res) =>{
    try {
        const { email, password } = req.body;
        const userData = await User.findOne({email})

        const isPasswordCorrect = await bcrypt.compare(password, userData.password);

        if (!isPasswordCorrect){
            return res.json({ success: false, message: "Invalid credentials" });
        }

        const token = generateToken(userData._id)

        const signedUser = await signUser(userData);
        res.json({success: true, userData: signedUser, token, message: "Login successful"})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
    }
}
// Controller to check if user is authenticated
export const checkAuth = async (req, res)=>{
    const signedUser = await signUser(req.user);
    res.json({success: true, user: signedUser});
}

// Controller to update user profile details
export const updateProfile = async (req, res)=>{
    try {
        const { profilePic, bio, fullName } = req.body;

        const userId = req.user._id;
        let updatedUser;

        if(!profilePic){
            updatedUser = await User.findByIdAndUpdate(userId, {bio, fullName}, {new: true});
        } else{
            const uploadUrl = await uploadToS3(profilePic);

            updatedUser = await User.findByIdAndUpdate(userId, {profilePic: uploadUrl, bio, fullName}, {new: true});
        }

        // Invalidate Redis profile cache to avoid serving stale profile data
        await redis.del(`user:profile:${userId}`);

        const signedUser = await signUser(updatedUser);
        res.json({success: true, user: signedUser})
    } catch (error) {
        console.log(error.message);
        res.json({success: false, message: error.message})
    }
}