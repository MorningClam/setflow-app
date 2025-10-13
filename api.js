/* =========================================================================
 * Setflow Frontend API Helper
 * ========================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Your web app's Firebase configuration
// This object is unique to your project
const firebaseConfig = {
  apiKey: "AIzaSyCsgE4N9TIud4Udydkb9lF0u1EynG8lCX8",
  authDomain: "setflow-app.firebaseapp.com",
  projectId: "setflow-app",
  storageBucket: "setflow-app.appspot.com",
  messagingSenderId: "664998437827",
  appId: "1:664998437827:web:1987f8c1f78c3ad8ad9376",
  measurementId: "G-M9TBBN7945"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);

console.log("Firebase has been initialized.");

/**
 * A placeholder function to fetch all gigs from the 'gigs' collection.
 * You can expand this to fetch gigs for the "Browse Gigs" page.
 * @returns {Promise<Array>} A promise that resolves to an array of gig documents.
 */
export async function fetchGigs() {
  const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const querySnapshot = await getDocs(collection(db, "gigs"));
  const gigs = [];
  querySnapshot.forEach((doc) => {
    gigs.push({ id: doc.id, ...doc.data() });
  });
  return gigs;
}