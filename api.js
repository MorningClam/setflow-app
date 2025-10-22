/* =========================================================================
 * Setflow Frontend API Helper
 * ========================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, setDoc, doc, getDoc, getDocs, collection, addDoc, Timestamp, query, where, orderBy, serverTimestamp, updateDoc, onSnapshot, limit, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
    roles: [role.toLowerCase()],
    bands: {}
  });
  return userCredential;
}

/**
 * Sends a password reset email to the given address.
 * @param {string} email The user's email address.
 * @returns {Promise<void>}
 */
export async function sendPasswordReset(email) {
    return await sendPasswordResetEmail(auth, email);
}

/**
 * Signs the current user out.
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  return await signOut(auth);
}

/**
 * Deletes the current user's account and associated data. Requires re-authentication.
 * @param {string} password - The current user's password for re-authentication.
 * @returns {Promise<void>}
 */
export async function deleteUserAccount(password) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("No user is signed in to delete.");
    }
    
    const credential = EmailAuthProvider.credential(user.email, password);
    
    try {
        await reauthenticateWithCredential(user, credential);
        // Re-authenticated successfully. Now delete user and data.
        
        // In a production app, this should trigger a Firebase Function
        // to atomically delete all user-related data from Firestore/Storage.
        // For this prototype, we'll delete the user document.
        const userDocRef = doc(db, "users", user.uid);
        await deleteDoc(userDocRef); // This is a placeholder; needs to be imported: `import {..., deleteDoc} from ...`

        // Finally, delete the user from Firebase Auth
        await deleteUser(user);

    } catch (error) {
        // This could be an incorrect password or another issue.
        console.error("Re-authentication failed:", error);
        throw new Error("Re-authentication failed. Please check your password and try again.");
    }
}


// --- BAND MANAGEMENT FUNCTIONS ---

/**
 * Creates a new band and assigns the creator as the admin.
 * @param {string} bandName - The name of the new band.
 * @param {object} adminUser - The user object of the creator.
 * @returns {Promise<void>}
 */
export async function createBand(bandName, adminUser) {
    const bandRef = doc(collection(db, "bands"));
    const userRef = doc(db, "users", adminUser.uid);

    const batch = writeBatch(db);

    batch.set(bandRef, {
        name: bandName,
        createdAt: serverTimestamp(),
        members: {
            [adminUser.uid]: {
                name: adminUser.displayName || adminUser.email,
                role: 'admin'
            }
        }
    });

    batch.update(userRef, {
        [`bands.${bandRef.id}`]: 'admin'
    });

    return await batch.commit();
}

/**
 * Fetches all bands a user is a member of.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Array>} A promise that resolves to an array of band objects.
 */
export async function getBandsForUser(userId) {
    const userData = await getUserData(userId);
    if (!userData || !userData.bands) return [];

    const bandIds = Object.keys(userData.bands);
    if (bandIds.length === 0) return [];

    const bandPromises = bandIds.map(async (bandId) => {
        const bandDoc = await getDoc(doc(db, "bands", bandId));
        if (bandDoc.exists()) {
            return {
                id: bandDoc.id,
                ...bandDoc.data(),
                role: userData.bands[bandId]
            };
        }
        return null;
    });

    const bands = await Promise.all(bandPromises);
    return bands.filter(band => band !== null);
}

/**
 * Fetches a single band's data, including detailed info for each member.
 * @param {string} bandId - The ID of the band to fetch.
 * @returns {Promise<Object>} A promise that resolves with the band's data object.
 */
export async function getBandData(bandId) {
    const bandRef = doc(db, "bands", bandId);
    const bandSnap = await getDoc(bandRef);

    if (!bandSnap.exists()) {
        throw new Error("Band not found.");
    }

    const bandData = bandSnap.data();
    const memberIds = Object.keys(bandData.members);

    const memberPromises = memberIds.map(async (id) => {
        const userData = await getUserData(id);
        return {
            id,
            name: userData ? userData.name : 'Unknown Member',
            photoURL: userData ? userData.profileImageUrl : null,
            role: bandData.members[id].role
        };
    });

    const members = await Promise.all(memberPromises);
    const memberMap = members.reduce((acc, member) => {
        acc[member.id] = member;
        return acc;
    }, {});

    return { id: bandSnap.id, ...bandData, members: memberMap };
}


/**
 * Invites a user to a band by their email.
 * @param {string} bandId - The ID of the band.
 * @param {string} inviteeEmail - The email of the user to invite.
 * @returns {Promise<void>}
 */
export async function inviteToBand(bandId, inviteeEmail) {
    // In a real app, this would trigger a backend function to send an email.
    // For this prototype, we will create an 'invitations' document.
    const q = query(collection(db, "users"), where("email", "==", inviteeEmail));
    const userSnapshot = await getDocs(q);

    if (userSnapshot.empty) {
        throw new Error("User with that email does not exist.");
    }
    const inviteeId = userSnapshot.docs[0].id;

    const inviteRef = doc(collection(db, "invitations"));
    return await setDoc(inviteRef, {
        bandId: bandId,
        inviteeId: inviteeId,
        status: 'pending',
        createdAt: serverTimestamp()
    });
}

/**
 * Removes a member from a band.
 * @param {string} bandId - The ID of the band.
 * @param {string} memberId - The ID of the member to remove.
 * @returns {Promise<void>}
 */
export async function removeMemberFromBand(bandId, memberId) {
    const bandRef = doc(db, "bands", bandId);
    const userRef = doc(db, "users", memberId);
    const batch = writeBatch(db);

    // This uses dot notation with a field path to remove a key from a map.
    batch.update(bandRef, {
        [`members.${memberId}`]: deleteField()
    });
    batch.update(userRef, {
        [`bands.${bandId}`]: deleteField()
    });

    return await batch.commit();
}

// --- USER DATA & PROFILE FUNCTIONS ---

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
 * Updates a user's profile data in their document.
 * @param {string} userId - The ID of the user to update.
 * @param {object} profileData - An object containing the fields to update (e.g., { name: 'New Name', bio: 'New Bio' }).
 * @returns {Promise<void>}
 */
export async function updateUserProfile(userId, profileData) {
  if (!userId) {
    throw new Error("User ID is required to update a profile.");
  }
  const userDocRef = doc(db, "users", userId);
  return await updateDoc(userDocRef, profileData);
}

/**
 * Updates a user's preferences data in their document.
 * @param {string} userId - The ID of the user to update.
 * @param {object} preferencesData - An object containing the fields to update (e.g., { travelRadius: 100 }).
 * @returns {Promise<void>}
 */
export async function updateUserPreferences(userId, preferencesData) {
  if (!userId) {
    throw new Error("User ID is required to update preferences.");
  }
  const userDocRef = doc(db, "users", userId);
  // This function is identical to updateUserProfile but provided for semantic clarity.
  return await updateDoc(userDocRef, preferencesData);
}


// --- GIG & APPLICATION FUNCTIONS ---

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
  const applicationsRef = collection(db, "applications");
  const q = query(applicationsRef, where("userId", "==", userId));

  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    return [];
  }

  const applicationPromises = querySnapshot.docs.map(async (appDoc) => {
    const applicationData = appDoc.data();
    const gigDocRef = doc(db, "gigs", applicationData.gigId);
    const gigDocSnap = await getDoc(gigDocRef);

    if (gigDocSnap.exists()) {
      const gigData = gigDocSnap.data();
      return {
        ...applicationData,
        id: appDoc.id,
        gigVenue: gigData.venueName,
        gigGenre: gigData.genre,
        gigDate: gigData.date.toDate().toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric'
        }),
      };
    }
    return null;
  });

  const applications = await Promise.all(applicationPromises);
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

  const applicationsRef = collection(db, "applications");
  const q = query(applicationsRef, where("gigId", "==", gigId));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    return [];
  }

  const applicantPromises = querySnapshot.docs.map(async (appDoc) => {
    const applicantId = appDoc.data().userId;
    const userData = await getUserData(applicantId);
    return userData ? { ...userData, id: applicantId } : null;
  });

  const applicants = await Promise.all(applicantPromises);
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
  const q = query(gigsRef, where("ownerId", "==", userId), orderBy("date", "desc"));
  const querySnapshot = await getDocs(q);
  const gigs = [];

  for (const doc of querySnapshot.docs) {
    const gigData = doc.data();
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
 * Fetches a single gear listing from Firestore.
 * @param {string} listingId - The ID of the gear listing to fetch.
 * @returns {Promise<Object|null>}
 */
export async function getGearListing(listingId) {
    if (!listingId) return null;
    const listingRef = doc(db, "gear_listings", listingId);
    const listingSnap = await getDoc(listingRef);
    if (listingSnap.exists()) {
        const listingData = listingSnap.data();
        const sellerData = await getUserData(listingData.sellerId);
        return {
            id: listingSnap.id,
            ...listingData,
            sellerName: sellerData ? sellerData.name : "Unknown Seller",
            sellerProfileImageUrl: sellerData ? sellerData.profileImageUrl : null
        };
    }
    return null;
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
  const conversationRef = doc(db, "conversations", conversationId);
  const batch = writeBatch(db);

  // Add the new message
  batch.set(doc(messagesRef), {
    ...messageData,
    timestamp: serverTimestamp(),
  });

  // Update the conversation's last message for quick retrieval
  batch.update(conversationRef, {
      lastMessage: {
          text: messageData.text,
          senderId: messageData.senderId,
          timestamp: serverTimestamp()
      }
  });
  
  return await batch.commit();
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
  const conversationPromises = querySnapshot.docs.map(async (convoDoc) => {
    const convoData = convoDoc.data();
    const otherParticipantId = convoData.participants.find(id => id !== userId);
    if (!otherParticipantId) return null;

    const otherUserData = await getUserData(otherParticipantId);
    
    // Use the lastMessage field on the conversation document, if it exists
    let lastMessage = convoData.lastMessage || { text: 'No messages yet...', timestamp: convoData.createdAt };

    return {
      id: convoDoc.id,
      ...convoData,
      otherUserName: otherUserData ? otherUserData.name : 'Unknown User',
      otherUserImage: otherUserData ? otherUserData.profileImageUrl : null,
      otherUserId: otherParticipantId,
      lastMessage: lastMessage
    };
  });

  const conversations = (await Promise.all(conversationPromises)).filter(c => c !== null);

  // Sort by the timestamp of the last message
  conversations.sort((a, b) => {
    const timeA = a.lastMessage.timestamp?.toDate() || 0;
    const timeB = b.lastMessage.timestamp?.toDate() || 0;
    return timeB - timeA;
  });

  return conversations;
}

/**
 * Creates a request for a user to join a band.
 * @param {string} bandId - The ID of the band to join.
 * @param {string} userId - The ID of the user requesting to join.
 * @returns {Promise<void>}
 */
export async function requestToJoinBand(bandId, userId) {
    const requestRef = doc(collection(db, "join_requests"));
    return await setDoc(requestRef, {
        bandId: bandId,
        userId: userId,
        status: 'pending',
        createdAt: serverTimestamp()
    });
}

/**
 * Fetches all pending join requests for a band.
 * @param {string} bandId - The ID of the band.
 * @returns {Promise<Array>} A promise that resolves to an array of request objects.
 */
export async function getJoinRequests(bandId) {
    const requestsRef = collection(db, "join_requests");
    const q = query(requestsRef, where("bandId", "==", bandId), where("status", "==", "pending"));
    
    const querySnapshot = await getDocs(q);
    const requests = [];

    for (const doc of querySnapshot.docs) {
        const requestData = doc.data();
        const userData = await getUserData(requestData.userId);
        if (userData) {
            requests.push({
                id: doc.id,
                ...requestData,
                userName: userData.name
            });
        }
    }
    return requests;
}

/**
 * Approves a join request, adding the user to the band.
 * @param {string} requestId - The ID of the join request to approve.
 * @returns {Promise<void>}
 */
export async function approveJoinRequest(requestId) {
    const requestRef = doc(db, "join_requests", requestId);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
        throw new Error("Request not found.");
    }

    const { bandId, userId } = requestSnap.data();
    const bandRef = doc(db, "bands", bandId);
    const userRef = doc(db, "users", userId);
    const userData = await getUserData(userId);

    const batch = writeBatch(db);

    batch.update(bandRef, {
        [`members.${userId}`]: {
            name: userData.name,
            role: 'member'
        }
    });

    batch.update(userRef, {
        [`bands.${bandId}`]: 'member'
    });

    batch.update(requestRef, {
        status: 'approved'
    });

    return await batch.commit();
}

/**
 * Fetches all users who have marked themselves as "Looking for Bands".
 * @returns {Promise<Array>} A promise that resolves to an array of user objects.
 */
export async function getAvailablePlayers() {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("isLookingForBands", "==", true));
  
  const querySnapshot = await getDocs(q);
  const players = [];
  querySnapshot.forEach((doc) => {
    players.push({ id: doc.id, ...doc.data() });
  });
  return players;
}

/**
 * Fetches all players.
 * @returns {Promise<Array>} A promise that resolves to an array of user objects.
 */
export async function getAllPlayers() {
  const usersRef = collection(db, "users");
  const q = query(usersRef);
  
  const querySnapshot = await getDocs(q);
  const players = [];
  querySnapshot.forEach((doc) => {
    players.push({ id: doc.id, ...doc.data() });
  });
  return players;
}

/**
 * Fetches all bands from the database.
 * @returns {Promise<Array>} A promise that resolves to an array of band objects.
 */
export async function getAllBands() {
    const bandsRef = collection(db, "bands");
    const q = query(bandsRef, orderBy("name"));
    
    const querySnapshot = await getDocs(q);
    const bands = [];
    querySnapshot.forEach((doc) => {
        bands.push({ id: doc.id, ...doc.data() });
    });
    return bands;
}