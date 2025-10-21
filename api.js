/* =========================================================================
 * Setflow Frontend API Helper
 * ========================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, setDoc, doc, getDoc, getDocs, collection, addDoc, Timestamp, query, where, orderBy, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
    return { id: userDocSnap.id, ...userDocSnap.data() };
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

/**
 * Fetches all calendar events for a specific user, ordered by date.
 * @param {string} userId - The ID of the user whose events to fetch.
 * @returns {Promise<Array>} A promise that resolves to an array of event documents.
 */
export async function fetchCalendarEvents(userId) {
  const eventsCollectionRef = collection(db, "calendarEvents");
  const q = query(eventsCollectionRef, where("userId", "==", userId), orderBy("date", "asc"));
  
  const querySnapshot = await getDocs(q);
  const events = [];
  querySnapshot.forEach((doc) => {
    const eventData = doc.data();
    const date = eventData.date.toDate();
    
    events.push({
      id: doc.id,
      ...eventData,
      formattedDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      formattedTime: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    });
  });
  return events;
}

/**
 * Creates a new application document in Firestore for a user applying to a gig.
 * @param {string} gigId - The ID of the gig being applied for.
 * @param {string} userId - The ID of the user applying.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function applyForGig(gigId, userId) {
  if (!gigId || !userId) {
    throw new Error("Gig ID and User ID are required to apply for a gig.");
  }
  
  const applicationData = {
    gigId: gigId,
    userId: userId,
    status: 'applied',
    appliedAt: serverTimestamp()
  };

  return await addDoc(collection(db, "applications"), applicationData);
}

/**
 * Fetches all applications for a specific user, along with the details of each associated gig.
 * @param {string} userId - The ID of the user whose applications to fetch.
 * @returns {Promise<Array>} A promise that resolves to an array of combined application and gig data.
 */
export async function fetchMyApplications(userId) {
  // Step 1: Create a query to find all applications by the current user
  const applicationsRef = collection(db, "applications");
  const q = query(applicationsRef, where("userId", "==", userId));

  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    return []; // Return an empty array if the user has no applications
  }

  // Step 2: For each application, fetch the corresponding gig details
  const applicationPromises = querySnapshot.docs.map(async (appDoc) => {
    const applicationData = appDoc.data();
    const gigDocRef = doc(db, "gigs", applicationData.gigId);
    const gigDocSnap = await getDoc(gigDocRef);

    if (gigDocSnap.exists()) {
      const gigData = gigDocSnap.data();
      // Step 3: Combine application status with gig data
      return {
        ...applicationData, // status, appliedAt, etc.
        id: appDoc.id,       // application ID
        gigVenue: gigData.venueName,
        gigGenre: gigData.genre,
        gigDate: gigData.date.toDate().toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric'
        }),
      };
    }
    return null; // Return null if a gig is not found
  });

  const applications = await Promise.all(applicationPromises);
  // Filter out any null results where a gig might have been deleted
  return applications.filter(app => app !== null);
}

/**
 * Fetches all applicants for a specific gig.
 * @param {string} gigId - The ID of the gig to fetch applicants for.
 * @returns {Promise<Array>} A promise that resolves to an array of applicant user data.
 */
export async function fetchApplicantsForGig(gigId) {
  if (!gigId) {
    throw new Error("Gig ID is required to fetch applicants.");
  }

  // Step 1: Find all applications for the given gigId
  const applicationsRef = collection(db, "applications");
  const q = query(applicationsRef, where("gigId", "==", gigId));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    return []; // No applicants for this gig
  }

  // Step 2: For each application, fetch the applicant's user data
  const applicantPromises = querySnapshot.docs.map(async (appDoc) => {
    const applicantId = appDoc.data().userId;
    const userData = await getUserData(applicantId);
    return userData ? { ...userData, id: applicantId } : null;
  });

  const applicants = await Promise.all(applicantPromises);

  // Filter out any potential null values if a user profile was not found
  return applicants.filter(applicant => applicant !== null);
}

/**
 * Fetches all gigs for a specific owner (venue or promoter).
 * @param {string} userId - The ID of the user whose gigs to fetch.
 * @returns {Promise<Array>} A promise that resolves to an array of gig documents.
 */
export async function fetchGigsForOwner(userId) {
  if (!userId) {
    throw new Error("User ID is required to fetch gigs.");
  }

  const gigsRef = collection(db, "gigs");
  // This query finds all gigs where the 'ownerId' field matches the current user's ID
  const q = query(gigsRef, where("ownerId", "==", userId), orderBy("date", "desc"));

  const querySnapshot = await getDocs(q);
  const gigs = [];

  // We also need to count the number of applicants for each gig.
  for (const doc of querySnapshot.docs) {
    const gigData = doc.data();

    // Create a sub-query to count applications for this gig
    const appsRef = collection(db, "applications");
    const appsQuery = query(appsRef, where("gigId", "==", doc.id));
    const appsSnapshot = await getDocs(appsQuery);
    const applicantCount = appsSnapshot.size; 

    gigs.push({
      id: doc.id,
      ...gigData,
      applicantCount: applicantCount,
      formattedDate: gigData.date.toDate().toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric'
      }),
    });
  }

  return gigs;
}

/**
 * Creates a new gig document in Firestore.
 * @param {object} gigData - The data for the new gig.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createGig(gigData) {
  if (!gigData.ownerId) {
    throw new Error("An ownerId must be provided to create a gig.");
  }

  const eventTimestamp = Timestamp.fromDate(new Date(gigData.date));

  const gigToSave = {
    ownerId: gigData.ownerId,
    venueName: gigData.eventName,
    location: gigData.location,
    date: eventTimestamp,
    payout: Number(gigData.payout),
    description: gigData.description,
    status: 'open',
    createdAt: serverTimestamp()
  };

  return await addDoc(collection(db, "gigs"), gigToSave);
}

/**
 * Creates a new gear listing in Firestore.
 * @param {object} itemData - The data for the item being listed.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createGearListing(itemData) {
  if (!itemData.sellerId) {
    throw new Error("A sellerId must be provided to create a listing.");
  }

  const itemToSave = {
    ...itemData,
    createdAt: serverTimestamp()
  };

  return await addDoc(collection(db, "gear_listings"), itemToSave);
}

/**
 * Fetches all gear listings from the 'gear_listings' collection.
 * @returns {Promise<Array>} A promise that resolves to an array of gear listing documents.
 */
export async function fetchGearListings() {
  const listingsRef = collection(db, "gear_listings");
  const q = query(listingsRef, orderBy("createdAt", "desc"));
  
  const querySnapshot = await getDocs(q);
  const listings = [];
  querySnapshot.forEach((doc) => {
    listings.push({ id: doc.id, ...doc.data() });
  });
  
  return listings;
}

/**
 * Creates a new player post in the 'player_posts' collection.
 * @param {object} postData - The data for the post.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createPlayerPost(postData) {
  if (!postData.userId) {
    throw new Error("A userId must be provided to create a player post.");
  }

  const postToSave = {
    ...postData,
    createdAt: serverTimestamp()
  };

  return await addDoc(collection(db, "player_posts"), postToSave);
}

/**
 * Fetches all player posts from the 'player_posts' collection, including user data.
 * @returns {Promise<Array>} A promise that resolves to an array of player post documents with user info.
 */
export async function fetchPlayerPosts() {
  const postsRef = collection(db, "player_posts");
  const q = query(postsRef, orderBy("createdAt", "desc"));

  const querySnapshot = await getDocs(q);
  const posts = [];
  
  for (const postDoc of querySnapshot.docs) {
    const postData = postDoc.data();
    const userData = await getUserData(postData.userId); 
    
    posts.push({ 
      id: postDoc.id, 
      ...postData,
      userName: userData ? userData.name : 'Unknown User',
      userProfileImage: userData ? userData.profileImageUrl : null 
    });
  }
  
  return posts;
}

/**
 * Updates a user's preferences in their profile document.
 * @param {string} userId - The ID of the user to update.
 * @param {object} preferences - An object containing the preferences to update (e.g., { travelRadius: 100 }).
 * @returns {Promise<void>}
 */
export async function updateUserPreferences(userId, preferences) {
  if (!userId) {
    throw new Error("User ID is required to update preferences.");
  }
  const userDocRef = doc(db, "users", userId);
  return await updateDoc(userDocRef, preferences);
}