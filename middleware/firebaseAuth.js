import { admin } from '../src/config/firebase';


export const verifyFirebaseToken = async (req, res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided"});
    }

    const token = header.split("Bearer ")[1];

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        console.error("Token verification failed:", error);
        return res.status(403).json({ message: "Invalid or expired token" });
        
    }
};