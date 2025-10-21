/* =========================================================================
 * Setflow Frontend API Helper
 * ========================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, setDoc, doc, getDoc, getDocs, collection, addDoc, Timestamp, query, where, orderBy, serverTimestamp, updateDoc, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

/**
 * Confirms a booking by updating the gig's status and assigning the artist.
 * @param {string} gigId - The ID of the gig to confirm.
 * @param {string} artistId - The ID of the artist being booked.
 * @param {string} artistName - The name of the artist being booked.
 * @returns {Promise<void>}
 */
export async function confirmBooking(gigId, artistId, artistName) {
  if (!gigId || !artistId || !artistName) {
    throw new Error("Gig ID, Artist ID, and Artist Name are required to confirm a booking.");
  }
  const gigDocRef = doc(db, "gigs", gigId);
  return await updateDoc(gigDocRef, {
    status: 'booked',
    bookedArtistId: artistId,
    bookedArtistName: artistName 
  });
}

/**
 * Creates a new review in the 'reviews' collection.
 * @param {object} reviewData - The data for the review.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createReview(reviewData) {
  if (!reviewData.reviewerId || !reviewData.subjectId || !reviewData.gigId) {
    throw new Error("Reviewer ID, subject ID, and gig ID are required to create a review.");
  }

  const reviewToSave = {
    ...reviewData,
    createdAt: serverTimestamp()
  };

  return await addDoc(collection(db, "reviews"), reviewToSave);
}

/**
 * Creates a new jam session in the 'jam_sessions' collection.
 * @param {object} sessionData - The data for the jam session.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createJamSession(sessionData) {
  if (!sessionData.hostId) {
    throw new Error("A hostId must be provided to create a jam session.");
  }

  const dateTimeString = `${sessionData.date}T${sessionData.time}`;
  const sessionTimestamp = Timestamp.fromDate(new Date(dateTimeString));

  const sessionToSave = {
    hostId: sessionData.hostId,
    title: sessionData.title,
    location: sessionData.location,
    dateTime: sessionTimestamp,
    description: sessionData.description,
    createdAt: serverTimestamp()
  };

  return await addDoc(collection(db, "jam_sessions"), sessionToSave);
}

/**
 * Fetches all jam sessions from the 'jam_sessions' collection, including host user data.
 * @returns {Promise<Array>} A promise that resolves to an array of jam session documents with host info.
 */
export async function fetchJamSessions() {
  const sessionsRef = collection(db, "jam_sessions");
  const q = query(sessionsRef, orderBy("dateTime", "asc"));

  const querySnapshot = await getDocs(q);
  const sessions = [];
  
  for (const sessionDoc of querySnapshot.docs) {
    const sessionData = sessionDoc.data();
    const hostData = await getUserData(sessionData.hostId); 
    
    const date = sessionData.dateTime.toDate();

    sessions.push({ 
      id: sessionDoc.id, 
      ...sessionData,
      hostName: hostData ? hostData.name : 'Unknown Host',
      hostProfileImage: hostData ? hostData.profileImageUrl : null,
      formattedDate: date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
      formattedTime: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    });
  }
  
  return sessions;
}

// --- MESSAGING FUNCTIONS ---

/**
 * Creates or retrieves a conversation between two users.
 * @param {string} userId1 - The ID of the current user.
 * @param {string} userId2 - The ID of the other user.
 * @returns {Promise<string>} The ID of the conversation.
 */
export async function createOrGetConversation(userId1, userId2) {
  const conversationId = [userId1, userId2].sort().join('_');
  const conversationRef = doc(db, "conversations", conversationId);
  const conversationSnap = await getDoc(conversationRef);

  if (!conversationSnap.exists()) {
    await setDoc(conversationRef, {
      participants: [userId1, userId2],
      createdAt: serverTimestamp(),
    });
  }
  return conversationId;
}

/**
 * Sends a message in a specific conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {object} messageData - The message object { text, senderId }.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function sendMessage(conversationId, messageData) {
  const messagesRef = collection(db, "conversations", conversationId, "messages");
  return await addDoc(messagesRef, {
    ...messageData,
    timestamp: serverTimestamp(),
  });
}

/**
 * Listens for real-time messages in a conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {function} callback - Function to be called with the array of messages.
 * @returns {import("firebase/firestore").Unsubscribe} A function to unsubscribe from the listener.
 */
export function getMessages(conversationId, callback) {
  const messagesRef = collection(db, "conversations", conversationId, "messages");
  const q = query(messagesRef, orderBy("timestamp", "asc"));

  return onSnapshot(q, (querySnapshot) => {
    const messages = [];
    querySnapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    callback(messages);
  });
}

/**
 * Fetches all conversations for a user, including the other participant's info and the last message.
 * @param {string} userId - The ID of the current user.
 * @returns {Promise<Array>} A promise that resolves to an array of conversation objects.
 */
export async function getConversations(userId) {
  const convosRef = collection(db, "conversations");
  const q = query(convosRef, where("participants", "array-contains", userId));

  const querySnapshot = await getDocs(q);
  const conversations = [];

  for (const convoDoc of querySnapshot.docs) {
    const convoData = convoDoc.data();
    
    const otherParticipantId = convoData.participants.find(id => id !== userId);
    if (!otherParticipantId) continue;

    const otherUserData = await getUserData(otherParticipantId);

    const messagesRef = collection(db, "conversations", convoDoc.id, "messages");
    const lastMessageQuery = query(messagesRef, orderBy("timestamp", "desc"), limit(1));
    const lastMessageSnapshot = await getDocs(lastMessageQuery);
    
    let lastMessage = { text: 'No messages yet...', timestamp: convoData.createdAt };
    if (!lastMessageSnapshot.empty) {
      lastMessage = lastMessageSnapshot.docs[0].data();
    }
    
    conversations.push({
      id: convoDoc.id,
      ...convoData,
      otherUserName: otherUserData ? otherUserData.name : 'Unknown User',
      otherUserImage: otherUserData ? otherUserData.profileImageUrl : null,
      otherUserId: otherParticipantId,
      lastMessage: lastMessage
    });
  }
  
  conversations.sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);

  return conversations;
}