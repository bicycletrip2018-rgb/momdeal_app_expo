import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDO081nwtD1v5nZviQRheffDQhEDNyInZs",
  authDomain: "momdeal-494c4.firebaseapp.com",
  projectId: "momdeal-494c4",
  storageBucket: "momdeal-494c4.firebasestorage.app",
  messagingSenderId: "518827684990",
  appId: "1:518827684990:web:4fca533bb22ab8d53d142f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firebase services
// initializeAuth with AsyncStorage persistence ensures the anonymous session
// survives app restarts — without this, a new UID is created on every launch.
export const db = getFirestore(app);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const functions = getFunctions(app, "us-central1");
export const storage   = getStorage(app);