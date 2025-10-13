/* =========================================================================
 * Setflow Frontend API Helper
 * ========================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, setDoc, doc, getDoc, getDocs, collection, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Your web app's Firebase configuration
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


// --- AUTHENTICATION FUNCTIONS ---

/**
 * Listens for changes in the user's authentication state.
 * @param {function} callback - A function to call with the user object (or null).
 * @returns {import("firebase/auth").Unsubscribe} A function to unsubscribe from the listener.
 */
export function onAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Signs in an existing user with email and password.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Promise<import("firebase/auth").UserCredential>} A promise that resolves with the user credential object.
 */
export async function signInUser(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

/**
 * Signs up a new user and creates a corresponding document in the 'users' collection.
 * @param {string} name - The user's name or band name.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's chosen password.
 * @param {string} role - The user's selected role (e.g., 'Musician', 'Venue').
 * @returns {Promise<import("firebase/auth").UserCredential>} A promise that resolves with the user credential object.
 */
export async function signUpUser(name, email, password, role) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  await setDoc(doc(db, "users", user.uid), {
    name: name,
    email: email,
    roles: [role.toLowerCase()]
  });
  return userCredential;
}

/**
 * Signs the current user out.
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  return await signOut(auth);
}


// --- FIRESTORE FUNCTIONS ---

/**
 * Fetches a user's data from the Firestore 'users' collection.
 * @param {string} userId - The unique ID of the user.
 * @returns {Promise<Object|null>} A promise that resolves with the user's data object or null if not found.
 */
export async function getUserData(userId) {
  const userDocRef = doc(db, "users", userId);
  const userDocSnap = await getDoc(userDocRef);
  if (userDocSnap.exists()) {
    return userDocSnap.data();
  } else {
    console.error("No user data found for ID:", userId);
    return null;
  }
}

/**
 * Fetches all gigs from the 'gigs' collection and formats the timestamp.
 * @returns {Promise<Array>} A promise that resolves to an array of gig documents.
 */
export async function fetchGigs() {
  const querySnapshot = await getDocs(collection(db, "gigs"));
  const gigs = [];
  querySnapshot.forEach((doc) => {
    const gigData = doc.data();
    const date = gigData.date.toDate().toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
    gigs.push({ id: doc.id, ...gigData, formattedDate: date });
  });
  return gigs;
}

/**
 * Creates a new event in the 'calendarEvents' collection.
 * @param {object} eventData - The data for the event.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createCalendarEvent(eventData) {
  // Combine date and time strings and convert to a JavaScript Date object, then to a Firestore Timestamp
  const dateTimeString = `${eventData.date}T${eventData.time}`;
  const eventTimestamp = Timestamp.fromDate(new Date(dateTimeString));

  const eventToSave = {
    userId: eventData.userId,
    title: eventData.title,
    type: eventData.type,
    date: eventTimestamp,
    notes: eventData.notes
  };

  return await addDoc(collection(db, "calendarEvents"), eventToSave);
}