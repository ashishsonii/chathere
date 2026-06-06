import express from "express";
import { protectRoute } from "../middleware/auth.js";
import { getCallHistory, getCallDetails, getTurnCredentials } from "../controllers/callController.js";

const router = express.Router();

// Get paginated call history for the logged-in user
router.get("/history", protectRoute, getCallHistory);

// Get TURN credentials
router.get("/turn-credentials", protectRoute, getTurnCredentials);

// Get details for a specific call by callId (UUID)
router.get("/:callId", protectRoute, getCallDetails);

export default router;
