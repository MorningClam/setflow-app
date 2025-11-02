/* =========================================================================
 * Setflow Frontend API Helper (Refactored for Consistency)
 * ========================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, setDoc, doc, getDoc, getDocs, collection, addDoc, Timestamp, query, where, orderBy, serverTimestamp, updateDoc, onSnapshot, limit, writeBatch, deleteField, deleteDoc, enableIndexedDbPersistence, collectionGroup // Added collectionGroup for potential future use
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider, deleteUser // Kept full auth imports
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { initializeAppCheck } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";

// Your web app's Firebase configuration (Keep as is for prototype)
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
const functions = getFunctions(app);

// --- Enable Offline Persistence ---
(async () => {
  try {
    // Note: enableIndexedDbPersistence throws if called after first Firestore operation.
    // Ensure this runs early. Consider wrapping Firestore calls in a function that waits for this.
    await enableIndexedDbPersistence(db);
    console.log("Firestore offline persistence enabled.");
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore offline persistence failed: Multiple tabs open?");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore offline persistence not supported here.");
    } else {
      console.error("Firestore offline persistence error:", err);
    }
  }
})();

console.log("Firebase initialized.");

// --- Network Status Handling ---
const network = {
  online: navigator.onLine,
  bannerElement: null,
  init: function() {
    document.addEventListener('DOMContentLoaded', () => {
        this.bannerElement = document.getElementById('offline-banner');
        this.updateBanner(); // Initial state
    });
    window.addEventListener('online', () => this.updateStatus(true));
    window.addEventListener('offline', () => this.updateStatus(false));
  },
  updateStatus: function(isOnline) {
    const wasOffline = !this.online;
    this.online = isOnline;
    // Check if toast exists on window before using it
    if (wasOffline && this.online && window.toast && typeof window.toast.show === 'function') {
        window.toast.show('Back online. Syncing data...', 'success', 2000);
    }
    this.updateBanner();
    document.body.dispatchEvent(new CustomEvent('app:network-change', { detail: { online: this.online } }));
  },
  updateBanner: function() {
    // Debounce or ensure element exists
    if (!this.bannerElement) {
        this.bannerElement = document.getElementById('offline-banner');
    }
    if (this.bannerElement) {
        this.bannerElement.style.display = this.online ? 'none' : 'block';
    }
  },
  isOnline: function() { return this.online; }
};
network.init();
export const isOnline = () => network.isOnline();


// --- UI Loading/State Helper ---
// Using canonical Tailwind classes for spinner
const spinnerHtml = `<div class="animate-spin border-4 border-neutral-500/30 border-t-emerald-500 rounded-full w-6 h-6"></div>`;
const spinnerInlineHtml = `<div class="loading-spinner-inline animate-spin border-2 border-white/30 border-t-emerald-500 rounded-full w-4 h-4 mr-2 align-middle inline-block"></div>`;

export const ui = {
    loading: {
        show: function(containerElement) {
            if (containerElement) {
                containerElement.innerHTML = `<div class="flex justify-center items-center py-10">${spinnerHtml}</div>`;
            }
        },
        // Removed hide as it's implicit when content replaces it
        createSpinnerElement: function(inline = false) {
             const div = document.createElement('div');
             div.innerHTML = inline ? spinnerInlineHtml : spinnerHtml;
             return div.firstChild; // Return the spinner div itself
        }
    }
    // Add ui.empty.show, ui.error.show if needed, using canonical EmptyState component structure
};

// --- Graceful Firestore Read Helper ---
/**
 * Wraps Firestore getDoc/getDocs calls. Returns Firestore result or null on error.
 * UI updates (loading/error) should be handled manually in the calling function using the state divs.
 * @param {Promise<*>} firestorePromise - Promise from getDoc or getDocs.
 * @param {string} [offlineMessage="Data may be unavailable offline."] - Message base for offline errors.
 * @param {string} [errorMessage="Error loading data."] - Message base for online errors.
 * @returns {Promise<*|null>} Firestore result or null. Throws specific error on failure.
 */
export async function gracefulGet(firestorePromise, offlineMessage = "Data may be unavailable offline.", errorMessage = "Error loading data.") {
    try {
        const result = await firestorePromise;
        // Check existence for getDoc results specifically
        if (result && typeof result.exists === 'function' && !result.exists()) {
            console.warn("Document not found."); // Log locally
            // Caller should handle the "not found" case based on context
            // Return the non-existent snapshot for the caller to check .exists()
        }
        return result; // Return snapshot/querySnapshot or undefined/null if promise resolves weirdly
    } catch (error) {
        console.error("Firestore read error:", error);
        // Throw a new error with a potentially more user-friendly message
        if (!isOnline()) {
             throw new Error(`${offlineMessage} (Offline)`);
        } else {
             throw new Error(`${errorMessage}: ${error.message}`);
        }
    }
}

// --- AUTHENTICATION FUNCTIONS ---

export function onAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInUser(email, password) {
  if (!isOnline()) throw new Error("Login requires connection.");
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpUser(name, email, password, role) {
   if (!isOnline()) throw new Error("Sign up requires connection.");
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  // Use setDoc which works offline after initial connection
  await setDoc(doc(db, "users", user.uid), {
    name: name,
    email: email,
    roles: [role.toLowerCase()], // Store as array
    bands: {}, // Initialize bands map
    profileSetupComplete: false, // Explicitly set setup incomplete
    createdAt: serverTimestamp()
  });
  return userCredential;
}

export async function sendPasswordReset(email) {
    if (!isOnline()) throw new Error("Password reset requires connection.");
    return await sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  return await signOut(auth);
}

export async function deleteUserAccount() {
    const user = auth.currentUser;
    if (!user) throw new Error("No user signed in.");
    if (!isOnline()) throw new Error("Account deletion requires connection.");
    try {
        const deleteAccountAtomic = httpsCallable(functions, 'deleteAccountAtomic');
        const result = await deleteAccountAtomic();
        if (result.data?.success) return result.data;
        throw new Error(result.data?.message || "Deletion failed on server.");
    } catch (error) {
        console.error("deleteAccountAtomic call failed:", error);
        throw new Error(error.message || "Failed to call deletion function.");
    }
}

// --- BAND MANAGEMENT FUNCTIONS ---
// (createBand, getBandsForUser, getBandData, inviteToBand, removeMemberFromBand, getJoinRequests, approveJoinRequest remain the same for now)
// ... [Existing Band Management Functions] ...
export async function createBand(bandName, adminUser) {
    // ... (logic remains the same, uses writeBatch) ...
    const bandRef = doc(collection(db, "bands"));
    const userRef = doc(db, "users", adminUser.uid);
    const batch = writeBatch(db);
    batch.set(bandRef, {
        name: bandName, createdAt: serverTimestamp(),
        members: { [adminUser.uid]: { name: adminUser.displayName || adminUser.email || 'Admin', role: 'admin', joinedAt: serverTimestamp() } }
     });
    batch.update(userRef, { [`bands.${bandRef.id}`]: 'admin' });
    return await batch.commit(); // Works offline
}

export async function getBandsForUser(userId) { // Removed loadingContainer param
    // Fetch user data first (gracefulGet handles errors/offline)
    const userSnap = await gracefulGet(getDoc(doc(db, "users", userId)), "Cannot load user data.");
    if (!userSnap?.exists()) return userSnap === null ? null : []; // Return null on error, [] if user not found

    const userData = userSnap.data();
    const bandIds = userData?.bands ? Object.keys(userData.bands) : [];
    if (bandIds.length === 0) return [];

    const bandPromises = bandIds.map(async (bandId) => {
        try {
            // Can't easily use gracefulGet per band without managing multiple spinners
            const bandDoc = await getDoc(doc(db, "bands", bandId)); // Uses cache if offline
            if (bandDoc.exists()) {
                return { id: bandDoc.id, ...bandDoc.data(), role: userData.bands[bandId] };
            }
            console.warn(`Band doc ${bandId} not found.`); return null;
        } catch (error) { console.error(`Error fetching band ${bandId}:`, error); return null; }
    });
    const bands = await Promise.all(bandPromises);
    return bands.filter(band => band !== null); // Filter out failures
}

export async function getBandData(bandId) { // Removed loadingContainer param
    const bandRef = doc(db, "bands", bandId);
    // Use gracefulGet for the main fetch
    const bandSnap = await gracefulGet(getDoc(bandRef), "Cannot load band data.");
    if (!bandSnap?.exists()) return null; // Null if error or not found

    const bandData = bandSnap.data();
    const memberIds = bandData.members ? Object.keys(bandData.members) : [];

    // Fetch detailed member data (best effort, uses cache offline)
    const memberPromises = memberIds.map(async (id) => {
        try {
            const userSnap = await getDoc(doc(db, "users", id)); // Uses cache
            const userData = userSnap.exists() ? userSnap.data() : {};
            const bandMemberInfo = bandData.members[id] || {};
            return {
                id,
                name: bandMemberInfo.name || userData.name || 'Unknown',
                photoURL: userData.profileImageUrl || null,
                role: bandMemberInfo.role || 'member'
            };
        } catch (error) {
            console.warn(`Could not fetch data for member ${id}:`, error);
            const bandMemberInfo = bandData.members[id] || {};
            return { id, name: bandMemberInfo.name || 'Offline?', photoURL: null, role: bandMemberInfo.role || 'member' };
        }
    });
    const membersArray = await Promise.all(memberPromises);
    const memberMap = membersArray.reduce((acc, member) => { acc[member.id] = member; return acc; }, {});

    return { id: bandSnap.id, ...bandData, members: memberMap };
}

export async function inviteToBand(bandId, inviteeEmail) {
    if (!isOnline()) throw new Error("Invites require connection.");
    const q = query(collection(db, "users"), where("email", "==", inviteeEmail));
    const userSnapshot = await getDocs(q); // Network needed
    if (userSnapshot.empty) throw new Error("User not found.");

    const inviteeId = userSnapshot.docs[0].id;
    const inviteeName = userSnapshot.docs[0].data().name || inviteeEmail;
    const bandSnap = await getDoc(doc(db, "bands", bandId)); // Cache potentially used
    if (bandSnap.exists() && bandSnap.data().members?.[inviteeId]) throw new Error(`${inviteeName} is already a member.`);

    const inviteRef = doc(collection(db, "invitations"));
    const bandName = bandSnap.exists() ? bandSnap.data().name : 'Unknown Band';
    return await setDoc(inviteRef, {
        bandId,
        bandName,
        inviteeId,
        inviteeName,
        status: 'pending',
        createdAt: serverTimestamp()
     }); // Works offline after first connection
}

export async function removeMemberFromBand(bandId, memberId) {
    const batch = writeBatch(db);
    batch.update(doc(db, "bands", bandId), { [`members.${memberId}`]: deleteField() });
    batch.update(doc(db, "users", memberId), { [`bands.${bandId}`]: deleteField() });
    return await batch.commit(); // Works offline
}

export async function getJoinRequests(bandId) { // Removed loadingContainer
    const requestsRef = collection(db, "join_requests");
    const q = query(requestsRef, where("bandId", "==", bandId), where("status", "==", "pending"), orderBy("createdAt", "asc"));
    // Use gracefulGet for the list fetch
    const querySnapshot = await gracefulGet(getDocs(q), "Could not load join requests.");
    if (!querySnapshot) return null; // Null on error

    const requestProcessingPromises = querySnapshot.docs.map(async (docSnap) => {
        const requestData = docSnap.data();
        let userName = 'User (Offline?)';
        try {
            // Best effort fetch using cache
            const userData = await getUserData(requestData.userId); // No container
            if (userData) userName = userData.name || 'Name Unavailable';
        } catch(error) { console.warn(`Could not fetch user data for join request ${docSnap.id}:`, error); userName = 'User (Error)'; }
        return { id: docSnap.id, ...requestData, userName };
    });
    return await Promise.all(requestProcessingPromises);
}

export async function approveJoinRequest(requestId) {
     const requestRef = doc(db, "join_requests", requestId);
     const requestSnap = await getDoc(requestRef); // Uses cache
     if (!requestSnap.exists() || requestSnap.data().status !== 'pending') throw new Error("Request not found or not pending.");
     const { bandId, userId } = requestSnap.data();
     const userSnap = await getDoc(doc(db, "users", userId)); // Uses cache
     const userName = userSnap.exists() ? userSnap.data().name || userId : userId;
     const batch = writeBatch(db);
     batch.update(doc(db, "bands", bandId), { [`members.${userId}`]: { name: userName, role: 'member', joinedAt: serverTimestamp() } });
     batch.update(doc(db, "users", userId), { [`bands.${bandId}`]: 'member' });
     batch.update(requestRef, { status: 'approved', processedAt: serverTimestamp() });
     return await batch.commit(); // Works offline
}

// --- NEW FUNCTION ---
/**
 * Creates a request for a user to join a band.
 * @param {string} bandId The ID of the band to join.
 * @param {string} userId The ID of the user requesting to join.
 * @returns {Promise<void>}
 */
export async function requestToJoinBand(bandId, userId) {
    if (!bandId || !userId) throw new Error("Band ID and User ID required.");
    // Check if a pending request already exists to prevent duplicates (optional but good practice)
    const requestsRef = collection(db, "join_requests");
    const q = query(requestsRef, where("bandId", "==", bandId), where("userId", "==", userId), where("status", "==", "pending"));
    const existingRequests = await getDocs(q); // Uses cache
    if (!existingRequests.empty) {
        throw new Error("You already have a pending request to join this band.");
    }
    // Create the new request
    const requestRef = doc(collection(db, "join_requests"));
    return await setDoc(requestRef, {
        bandId: bandId,
        userId: userId,
        status: 'pending',
        createdAt: serverTimestamp()
    }); // Works offline
}

// --- USER DATA & PROFILE FUNCTIONS ---

export async function getUserData(userId) { // Removed loadingContainer
  if (!userId) { console.error("getUserData: userId is required."); return null; }
  const userDocRef = doc(db, "users", userId);
  // Use gracefulGet for the fetch
  const userDocSnap = await gracefulGet(getDoc(userDocRef), "Could not load user data.");
  // Return data object or null
  return userDocSnap?.exists() ? { id: userDocSnap.id, ...userDocSnap.data() } : null;
}

export async function updateUserProfile(userId, profileData) {
  if (!userId) throw new Error("User ID required.");
  const userDocRef = doc(db, "users", userId);
  profileData.updatedAt = serverTimestamp();
  return await updateDoc(userDocRef, profileData); // Works offline
}

export async function updateUserPreferences(userId, preferencesData) {
    if (!userId) throw new Error("User ID required.");
    const userDocRef = doc(db, "users", userId);
    preferencesData.updatedAt = serverTimestamp();
    return await updateDoc(userDocRef, preferencesData); // Works offline
}

// --- GIG & APPLICATION FUNCTIONS ---

export async function fetchGigs() { // Removed loadingContainer
  const q = query(collection(db, "gigs"), where("status", "==", "open"), orderBy("date", "asc")); // Filter open, order by date
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load gigs.");
  if (!querySnapshot) return null; // Null on error

  const gigs = [];
  querySnapshot.forEach((doc) => {
    const gigData = doc.data();
    const dateObj = gigData.date?.toDate ? gigData.date.toDate() : null;
    gigs.push({
        id: doc.id, ...gigData,
        dateObject: dateObj, // Keep Date object
        formattedDate: dateObj ? dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date TBD'
    });
  });
  return gigs;
}

export async function getGigDetails(id) {
    if (!id) throw new Error("Gig ID required.");
    // Let caller use gracefulGet
    return getDoc(doc(db, "gigs", id));
}

// --- NEW FUNCTION ---
/**
 * Fetches gigs that a specific musician has completed (booked and date passed).
 * @param {string} userId The musician's user ID.
 * @returns {Promise<Array|null>} Array of completed gig objects or null on error.
 */
export async function fetchCompletedGigsForUser(userId) {
    if (!userId) throw new Error("User ID required.");
    const gigsRef = collection(db, "gigs");
    const yesterday = new Date(); // Get gigs up to yesterday
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayTimestamp = Timestamp.fromDate(yesterday);

    const q = query(gigsRef,
        where("bookedArtistId", "==", userId),
        where("status", "==", "booked"),
        where("date", "<=", yesterdayTimestamp), // Date must be in the past
        orderBy("date", "desc") // Most recent completed first
    );

    // Use gracefulGet
    const querySnapshot = await gracefulGet(getDocs(q), "Could not load completed gigs.");
    if (!querySnapshot) return null; // Null on error

    const gigs = [];
    querySnapshot.forEach((doc) => {
        const gigData = doc.data();
        const dateObj = gigData.date?.toDate ? gigData.date.toDate() : null;
        gigs.push({
            id: doc.id, ...gigData,
            dateObject: dateObj, // Keep Date object
            formattedDate: dateObj ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date N/A'
        });
    });
    return gigs;
}


export async function createCalendarEvent(eventData) {
  let eventTimestamp;
  try {
      // Ensure date and time are valid before creating Date
      if (!eventData.date || !eventData.time) throw new Error("Date and time are required.");
      const dateTimeString = `${eventData.date}T${eventData.time}`;
      const dateObj = new Date(dateTimeString);
      if (isNaN(dateObj)) throw new Error("Invalid date/time format.");
      eventTimestamp = Timestamp.fromDate(dateObj);
  } catch (e) { console.error("Calendar event date error:", e); throw e; }
  const eventToSave = {
      userId: eventData.userId, title: eventData.title, type: eventData.type,
      dateTime: eventTimestamp, // Use a consistent field name? Or keep 'date' if used elsewhere
      notes: eventData.notes || '', createdAt: serverTimestamp()
  };
  return await addDoc(collection(db, "calendarEvents"), eventToSave); // Works offline
}

export async function fetchCalendarEvents(userId) { // Removed loadingContainer
  const eventsRef = collection(db, "calendarEvents");
  // Fetch events where date is today or later
  const todayTimestamp = Timestamp.fromDate(new Date(new Date().setHours(0,0,0,0)));
  const q = query(eventsRef, where("userId", "==", userId), where("dateTime", ">=", todayTimestamp), orderBy("dateTime", "asc"));

  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load calendar.");
  if (!querySnapshot) return null;

  const events = [];
  querySnapshot.forEach((doc) => {
    const eventData = doc.data();
    const dateObj = eventData.dateTime?.toDate ? eventData.dateTime.toDate() : null;
    if (dateObj) { // Ensure date is valid
        // Determine type based on source if possible (e.g., from a gig booking)
        let eventType = eventData.type || 'Other';
        let gigId = eventData.gigId || null; // Assume gigId might be stored on calendar event
         // Correctly fetch 'gig' type if it exists in data, map it properly
        if (eventData.type === 'gig' || gigId) { // Check if it's explicitly a gig or has a gigId
            eventType = 'gig';
            gigId = gigId || doc.id; // Use event ID as fallback if gigId not present but type is gig
        }

        events.push({
          id: gigId || doc.id, // Prefer gigId if available for linking
          title: eventData.title,
          type: eventType, // Use determined type
          dateObject: dateObj,
          formattedDate: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          formattedTime: dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        });
    }
  });
  return events;
}


export async function applyForGig(gigId, userId) {
  if (!gigId || !userId) throw new Error("Gig/User ID required.");
  const batch = writeBatch(db);
  batch.set(doc(collection(db, "applications")), { gigId, userId, status: 'applied', appliedAt: serverTimestamp() });
  batch.update(doc(db, "users", userId), { [`appliedGigs.${gigId}`]: true }); // Or Timestamp.now()
  // TODO: Decrement applicationsLeft if implementing limits
  return await batch.commit(); // Works offline
}

export async function fetchMyApplications(userId) { // Removed loadingContainer
  const appsRef = collection(db, "applications");
  const q = query(appsRef, where("userId", "==", userId), orderBy("appliedAt", "desc"));
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load applications.");
  if (!querySnapshot) return null;

  if (querySnapshot.empty) return [];

  const applicationPromises = querySnapshot.docs.map(async (appDoc) => {
    const appData = appDoc.data();
    try {
        const gigSnap = await getDoc(doc(db, "gigs", appData.gigId)); // Uses cache
        const gigData = gigSnap.exists() ? gigSnap.data() : {};
        const dateObj = gigData.date?.toDate ? gigData.date.toDate() : null;
        return {
            ...appData, id: appDoc.id,
            gigVenue: gigData.venueName || 'Gig Deleted?',
            gigGenre: gigData.genre || 'N/A',
            gigDate: dateObj ? dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'N/A',
            gigId: appData.gigId // Ensure included
         };
    } catch (error) {
        console.warn(`Could not fetch gig details for app ${appDoc.id}:`, error);
         return { ...appData, id: appDoc.id, gigVenue: 'Details Unavailable', gigGenre: '', gigDate: '' };
    }
  });
  return await Promise.all(applicationPromises);
}

export async function fetchApplicantsForGig(gigId) { // Removed loadingContainer
  if (!gigId) throw new Error("Gig ID required.");
  const appsRef = collection(db, "applications");
  const q = query(appsRef, where("gigId", "==", gigId), orderBy("appliedAt", "asc"));
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load applicants.");
  if (!querySnapshot) return null;

  if (querySnapshot.empty) return [];

  const applicantPromises = querySnapshot.docs.map(async (appDoc) => {
    const applicantId = appDoc.data().userId;
    try {
        // Use getUserData which uses cache
        const userData = await getUserData(applicantId); // No container
        return userData ? { ...userData, id: applicantId } : null; // Add ID
    } catch (error) { console.warn(`Could not fetch applicant ${applicantId}:`, error); return null; }
  });
  const applicants = await Promise.all(applicantPromises);
  return applicants.filter(a => a !== null); // Filter out failures
}

export async function fetchGigsForOwner(userId) { // Removed loadingContainer
  if (!userId) throw new Error("User ID required.");
  const gigsRef = collection(db, "gigs");
  const q = query(gigsRef, where("ownerId", "==", userId), orderBy("date", "desc"));
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load your gigs.");
  if (!querySnapshot) return null;

  const gigProcessingPromises = querySnapshot.docs.map(async (docSnap) => {
      const gigData = docSnap.data();
      let applicantCount = 0;
      try {
          // Count applicants (uses cache offline)
          const appsQuery = query(collection(db, "applications"), where("gigId", "==", docSnap.id));
          const appsSnapshot = await getDocs(appsQuery);
          applicantCount = appsSnapshot.size;
      } catch (error) { console.warn(`Could not get applicant count for ${docSnap.id}:`, error); }

      const dateObj = gigData.date?.toDate ? gigData.date.toDate() : null;
      return {
           id: docSnap.id, ...gigData, dateObject: dateObj, applicantCount,
           formattedDate: dateObj ? dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Date N/A'
       };
  });
  return await Promise.all(gigProcessingPromises);
}

export async function createGig(gigData) {
    if (!gigData.ownerId) throw new Error("ownerId required.");
    let eventTimestamp;
    try {
        if (!gigData.date) throw new Error("Date is required.");
        // Assume YYYY-MM-DD, add midday time to avoid timezone issues on conversion
        const dateObj = new Date(gigData.date + 'T12:00:00Z'); // Use UTC midday
        if (isNaN(dateObj)) throw new Error("Invalid date format.");
        eventTimestamp = Timestamp.fromDate(dateObj);
    } catch(e) { console.error("Gig date error:", e); throw e; }
    const gigToSave = {
        ownerId: gigData.ownerId, venueName: gigData.eventName, location: gigData.location,
        date: eventTimestamp, payout: Number(gigData.payout),
        description: gigData.description || '', genre: gigData.genre || '',
        status: 'open', createdAt: serverTimestamp(),
        // Add default guestListLimit
        guestListLimit: 5 // Default guest list limit
    };
    return await addDoc(collection(db, "gigs"), gigToSave); // Works offline
}


// --- GEAR LISTING FUNCTIONS ---
// (createGearListing, fetchGearListings, getGearListing remain the same for now)
// ... [Existing Gear Listing Functions] ...
export async function createGearListing(itemData) {
    if (!itemData.sellerId) throw new Error("sellerId required.");
    const itemToSave = { ...itemData, price: Number(itemData.price), createdAt: serverTimestamp() };
    return await addDoc(collection(db, "gear_listings"), itemToSave); // Works offline
}

export async function fetchGearListings() { // Removed loadingContainer
  const q = query(collection(db, "gear_listings"), orderBy("createdAt", "desc"));
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load gear.");
  if (!querySnapshot) return null;
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getGearListing(listingId) { // Removed loadingContainer
    if (!listingId) return null;
    const listingRef = doc(db, "gear_listings", listingId);
    // Use gracefulGet for main fetch
    const listingSnap = await gracefulGet(getDoc(listingRef), "Could not load item details.");
    if (!listingSnap?.exists()) return null;

    const listingData = listingSnap.data();
    let sellerName = "Seller (Offline?)";
    let sellerProfileImageUrl = null;

    // Best effort fetch for seller using cache
    try {
        const sellerData = await getUserData(listingData.sellerId); // No container
        if (sellerData) {
            sellerName = sellerData.name || 'Name Unavailable';
            sellerProfileImageUrl = sellerData.profileImageUrl;
        }
    } catch (error) { console.warn(`Could not fetch seller ${listingData.sellerId}:`, error); sellerName = "Seller (Error)"; }

    return { id: listingSnap.id, ...listingData, sellerName, sellerProfileImageUrl };
}

// --- PLAYER POST FUNCTIONS ---
// (createPlayerPost, fetchPlayerPosts remain the same for now)
// ... [Existing Player Post Functions] ...
export async function createPlayerPost(postData) {
    if (!postData.userId) throw new Error("userId required.");
    // Convert date string if present
    if (postData.date) {
        try {
            const dateObj = new Date(postData.date); // Assumes YYYY-MM-DDTHH:mm
            if (!isNaN(dateObj)) {
                postData.dateTime = Timestamp.fromDate(dateObj); // Use timestamp
            } else { console.warn("Invalid date provided for player post:", postData.date); }
            delete postData.date; // Remove original string
        } catch (e) { console.warn("Error parsing date for player post:", postData.date, e); delete postData.date; }
    }
    const postToSave = { ...postData, createdAt: serverTimestamp() };
    return await addDoc(collection(db, "player_posts"), postToSave); // Works offline
}

export async function fetchPlayerPosts() { // Removed loadingContainer
  const q = query(collection(db, "player_posts"), orderBy("createdAt", "desc"));
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load posts.");
  if (!querySnapshot) return null;

  const postProcessingPromises = querySnapshot.docs.map(async (postDoc) => {
      const postData = postDoc.data();
      let userName = 'User (Offline?)'; let userProfileImage = null;
      try {
          const userData = await getUserData(postData.userId); // No container, uses cache
          if(userData) { userName = userData.name || 'Name Unavailable'; userProfileImage = userData.profileImageUrl; }
      } catch(error) { console.warn(`Could not fetch user for post ${postDoc.id}:`, error); userName = 'User (Error)'; }
      // Re-add original date string if needed, or format timestamp
      const postDate = postData.dateTime?.toDate ? postData.dateTime.toDate().toISOString().slice(0, 16) : postData.date; // Use timestamp if available
      return { id: postDoc.id, ...postData, date: postDate, userName, userProfileImage }; // Return 'date' field
  });
  return await Promise.all(postProcessingPromises);
}

// --- BOOKING & REVIEW FUNCTIONS ---
// (confirmBooking, createReview remain the same for now)
// ... [Existing Booking & Review Functions] ...
export async function confirmBooking(gigId, artistId, artistName) {
    if (!gigId || !artistId || !artistName) throw new Error("Required info missing.");
    const gigRef = doc(db, "gigs", gigId);
    // Update gig status
    await updateDoc(gigRef, {
        status: 'booked', bookedArtistId: artistId, bookedArtistName: artistName,
        bookedAt: serverTimestamp()
    }); // Works offline

    // Add booked gig to artist's calendar
    const gigSnap = await getDoc(gigRef); // Re-fetch to get date, etc. (uses cache)
    if (gigSnap.exists()) {
        const gigData = gigSnap.data();
        const eventData = {
            userId: artistId,
            title: `Gig: ${gigData.venueName}`,
            type: 'gig', // Specific type for calendar
            dateTime: gigData.date, // Use the Firestore Timestamp
            notes: `Booked via Setflow. Payout: $${gigData.payout}`,
            gigId: gigId // Link back to the gig
        };
        // Use setDoc with a specific ID to prevent duplicates if function runs twice
        const calendarEventRef = doc(db, "calendarEvents", `gig_${gigId}_${artistId}`);
        await setDoc(calendarEventRef, { ...eventData, createdAt: serverTimestamp() });
        console.log(`Gig added to calendar for artist ${artistId}`);
    } else {
        console.warn(`Could not find gig ${gigId} to add to calendar.`);
    }

    return true; // Indicate success
}


export async function createReview(reviewData) {
    if (!reviewData.reviewerId || !reviewData.subjectId || !reviewData.gigId || !reviewData.type) throw new Error("Required info missing.");
    reviewData.rating = Number(reviewData.rating);
    const reviewToSave = { ...reviewData, createdAt: serverTimestamp() };
    return await addDoc(collection(db, "reviews"), reviewToSave); // Works offline
}

// --- JAM SESSION FUNCTIONS ---
// (createJamSession, fetchJamSessions remain the same for now)
// ... [Existing Jam Session Functions] ...
export async function createJamSession(sessionData) {
    if (!sessionData.hostId) throw new Error("hostId required.");
    let sessionTimestamp;
    try {
        if (!sessionData.date || !sessionData.time) throw new Error("Date and Time required.");
        const dateTimeString = `${sessionData.date}T${sessionData.time}`;
        const dateObj = new Date(dateTimeString);
        if (isNaN(dateObj)) throw new Error("Invalid date/time format.");
        sessionTimestamp = Timestamp.fromDate(dateObj);
    } catch (e) { console.error("Jam session date error:", e); throw e; }
    const sessionToSave = {
        hostId: sessionData.hostId, title: sessionData.title, location: sessionData.location,
        dateTime: sessionTimestamp, description: sessionData.description || '',
        createdAt: serverTimestamp()
     };
    return await addDoc(collection(db, "jam_sessions"), sessionToSave); // Works offline
}

export async function fetchJamSessions() { // Removed loadingContainer
  const q = query(collection(db, "jam_sessions"), orderBy("dateTime", "asc"));
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load sessions.");
  if (!querySnapshot) return null;

  const sessionProcessingPromises = querySnapshot.docs.map(async (sessionDoc) => {
      const sessionData = sessionDoc.data();
      let hostName = 'Host (Offline?)'; let hostProfileImage = null;
      try {
          const hostData = await getUserData(sessionData.hostId); // No container, uses cache
          if (hostData) { hostName = hostData.name || 'Name Unavailable'; hostProfileImage = hostData.profileImageUrl; }
      } catch(error) { console.warn(`Could not fetch host for session ${sessionDoc.id}:`, error); hostName = 'Host (Error)'; }

      const dateObj = sessionData.dateTime?.toDate ? sessionData.dateTime.toDate() : null;
      if (dateObj) {
          return {
            id: sessionDoc.id, ...sessionData, hostName, hostProfileImage,
            dateObject: dateObj,
            formattedDate: dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            formattedTime: dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          };
      } else { console.warn(`Jam session ${sessionDoc.id} skipped due to invalid date.`); return null; }
  });
  const sessions = await Promise.all(sessionProcessingPromises);
  return sessions.filter(s => s !== null); // Filter out invalid date entries
}

// --- MESSAGING FUNCTIONS ---
// (createOrGetConversation, sendMessage, getMessages, getConversations remain the same for now)
// ... [Existing Messaging Functions] ...
export async function createOrGetConversation(userId1, userId2) {
    const conversationId = [userId1, userId2].sort().join('_');
    const conversationRef = doc(db, "conversations", conversationId);
    const conversationSnap = await getDoc(conversationRef); // Uses cache
    if (!conversationSnap.exists()) {
        let user1Name = 'User 1'; let user2Name = 'User 2';
        try { // Best effort fetch using cache
            const [user1Data, user2Data] = await Promise.all([ getUserData(userId1), getUserData(userId2) ]);
            user1Name = user1Data?.name || userId1; user2Name = user2Data?.name || userId2;
        } catch (e) { console.warn("Could not fetch user names for convo:", e); }
        await setDoc(conversationRef, {
            participants: [userId1, userId2],
            participantInfo: { [userId1]: { name: user1Name }, [userId2]: { name: user2Name } },
            createdAt: serverTimestamp()
        }); // Works offline
    }
    return conversationId;
}

export async function sendMessage(conversationId, messageData) {
    const batch = writeBatch(db);
    const newMessageRef = doc(collection(db, "conversations", conversationId, "messages"));
    batch.set(newMessageRef, { ...messageData, timestamp: serverTimestamp() });
    batch.update(doc(db, "conversations", conversationId), {
        lastMessage: { text: messageData.text, senderId: messageData.senderId, timestamp: serverTimestamp() }
     });
    return await batch.commit(); // Works offline
}

export function getMessages(conversationId, callback, errorCallback = console.error) {
    const q = query(collection(db, "conversations", conversationId, "messages"), orderBy("timestamp", "asc"));
    return onSnapshot(q, (querySnapshot) => {
        const messages = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Messages from:", querySnapshot.metadata.fromCache ? "cache" : "server");
        callback(messages);
    }, errorCallback);
}

export async function getConversations(userId) { // Removed loadingContainer
  const q = query(collection(db, "conversations"), where("participants", "array-contains", userId));
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load messages.");
  if (!querySnapshot) return null;

  const conversationPromises = querySnapshot.docs.map(async (convoDoc) => {
    const convoData = convoDoc.data();
    const otherParticipantId = convoData.participants.find(id => id !== userId);
    if (!otherParticipantId) return null;

    let otherUserName = convoData.participantInfo?.[otherParticipantId]?.name || 'User (Offline?)';
    let otherUserImage = null;
    try { // Best effort fetch using cache
        const otherUserData = await getUserData(otherParticipantId); // No container
        if(otherUserData){ otherUserName = otherUserData.name || otherUserName; otherUserImage = otherUserData.profileImageUrl; }
    } catch (error) { console.warn(`Could not fetch user ${otherParticipantId}:`, error); otherUserName = otherUserName === 'User (Offline?)' ? 'User (Error)' : otherUserName; }

    let lastMessage = convoData.lastMessage || { text: 'No messages yet...', timestamp: convoData.createdAt };

    return { id: convoDoc.id, ...convoData, otherUserName, otherUserImage, otherUserId: otherParticipantId, lastMessage };
  });

  const conversations = (await Promise.all(conversationPromises)).filter(c => c !== null);
  conversations.sort((a, b) => (b.lastMessage.timestamp?.toDate() || 0) - (a.lastMessage.timestamp?.toDate() || 0));
  return conversations;
}

// --- REPORTING ---

export async function reportContent(reportedItemId, reportedItemType, reporterId, reason = 'N/A') {
    if (!reportedItemId || !reportedItemType || !reporterId) throw new Error("Missing fields for report.");
    const reportData = { reportedItemId, reportedItemType, reporterId, reason, status: 'pending', createdAt: serverTimestamp() };
    return await addDoc(collection(db, "reports"), reportData); // Works offline
}

// --- PLAYER DISCOVERY ---

// TODO: Inefficient for large scale. Needs server-side pagination/filtering.
export async function getAllPlayers() { // Removed loadingContainer
  const q = query(collection(db, "users"), where("roles", "array-contains", "musician"), orderBy("name")); // Filter musicians, add index for name
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load players.");
  if (!querySnapshot) return null;
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// TODO: Inefficient for large scale. Needs server-side pagination/filtering.
export async function getAllBands() { // Removed loadingContainer
    const q = query(collection(db, "bands"), orderBy("name")); // Add index for name
    // Use gracefulGet
    const querySnapshot = await gracefulGet(getDocs(q), "Could not load bands.");
    if (!querySnapshot) return null;
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}


// --- NEW PLACEHOLDER FUNCTIONS ---

// TODO: Implement actual Firestore logic for fetching templates.
export async function fetchGigTemplates(userId) {
    console.log("Fetching gig templates for user:", userId);
    // Placeholder data
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
    return [
        { id: 'tpl1', name: 'Saturday Night Headliner', startTime: '9:00 PM', endTime: '11:00 PM', payout: 500, genres: ['Rock', 'Indie', 'Pop'], description: 'Standard headliner slot, 2x60min sets.' },
        { id: 'tpl2', name: 'Acoustic Tuesday', startTime: '7:00 PM', endTime: '9:00 PM', payout: 250, genres: ['Singer-Songwriter', 'Folk'], description: null },
    ];
}

// TODO: Implement actual Firestore logic for fetching user's network.
export async function fetchUserNetwork(userId) {
    console.log("Fetching network for user:", userId);
    // Placeholder data
    await new Promise(resolve => setTimeout(resolve, 800)); // Simulate delay
    return [
         { id: 'venueUser1', name: 'The Pour House', role: 'Venue', location: 'Raleigh, NC', profileImageUrl: null },
         { id: 'musicianUser1', name: 'Alice Keys', role: 'Musician', location: 'Cary, NC', profileImageUrl: null },
         { id: 'promoterUser1', name: 'Maria (Fest)', role: 'Promoter', location: 'Apex, NC', profileImageUrl: 'https://images.unsplash.com/photo-1598387993441-3cf0b5354d24?q=80&w=2187&auto=format=fit=crop' },
    ];
}

// TODO: Implement actual Firestore logic for fetching notifications.
export async function fetchNotifications(userId) {
    console.log("Fetching notifications for user:", userId);
    // Placeholder data
    await new Promise(resolve => setTimeout(resolve, 600)); // Simulate delay
    return [
        { id: 'notif1', type: 'application_viewed', text: '<span class="font-semibold">Venue X</span> viewed your application for <span class="font-semibold text-emerald-400">Weekend Gig</span>.', timestampRelative: '1 hour ago', link: '#', isUnread: true },
        { id: 'notif2', type: 'new_message', text: 'New message from <span class="font-semibold">Promoter Y</span>.', timestampRelative: 'Yesterday', link: 'setflow-conversation-view.html?recipientId=promoterY', isUnread: false },
        { id: 'notif3', type: 'gig_booked', text: 'You\'ve been booked for <span class="font-semibold text-amber-400">Acoustic Night</span>.', timestampRelative: '3 days ago', link: 'setflow-show-sheet.html?gigId=gigABC', isUnread: false },
    ];
}

// TODO: Implement actual Firestore logic for fetching setlist (likely from gig document).
export async function fetchSetlist(eventId) {
    console.log("Fetching setlist for event:", eventId);
    if (!eventId) return []; // Handle missing ID case
    // Placeholder: Fetch gig doc and return its 'songs' array
    const gigSnap = await getDoc(doc(db, "gigs", eventId)); // Uses cache
    if (gigSnap.exists() && gigSnap.data().songs) {
        return gigSnap.data().songs; // Assuming songs are stored as an array of objects/strings
    }
    // Placeholder data if not found
    await new Promise(resolve => setTimeout(resolve, 700)); // Simulate delay
    return [
        { title: 'Sample Song 1', artist: 'Artist A' },
        { title: 'Sample Song 2', artist: 'Artist B' },
    ];
}

// TODO: Implement actual Firestore logic for saving setlist (update gig document).
export async function saveSetlist(eventId, songs) {
    if (!eventId || !songs) throw new Error("Event ID and songs array required.");
    console.log("Saving setlist for event:", eventId, songs);
    const gigRef = doc(db, "gigs", eventId);
    await updateDoc(gigRef, {
        songs: songs, // Overwrite or update the songs array
        setlistUpdatedAt: serverTimestamp()
    }); // Works offline
    return true;
}

// TODO: Implement actual Firestore logic for fetching scouted artists (e.g., from user doc).
export async function fetchTalentPool(userId) {
    console.log("Fetching talent pool for user:", userId);
    // Placeholder data
    await new Promise(resolve => setTimeout(resolve, 900)); // Simulate delay
    return [
        { id: 'artist1', name: 'George & The Vibe', genres: ['Funk', 'Soul'], rating: 4.9, profileImageUrl: 'https://images.unsplash.com/photo-1521402321589-6689539a-9557?q=80&w=2187&auto=format=fit=crop' },
        { id: 'artist2', name: 'The Sidewinders', genres: ['Blues Rock'], rating: 4.7, profileImageUrl: 'https://images.unsplash.com/photo-1598387993441-3cf0b5354d24?q=80&w=2187&auto=format=fit=crop' },
    ];
}

// --- VENUE FETCHING (Placeholder) ---

// TODO: Implement actual location-based fetching or better source.
export async function fetchNearbyVenues(limitCount = 3) {
    // For now, return a few hardcoded venues
    const hardcodedVenues = [
        { id: 'venueUser1', name: "The Pour House", location: "Raleigh, NC", roles: ["venue"] },
        { id: 'venueUser2', name: "Cat's Cradle", location: "Carrboro, NC", roles: ["venue"] },
        { id: 'venueUser3', name: "Lincoln Theatre", location: "Raleigh, NC", roles: ["venue"] },
    ];
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async
    return hardcodedVenues.slice(0, limitCount);
}


// --- MODAL HANDLING --- ADDED FOR CENTRALIZATION ---

/**
 * Initializes modal open/close functionality for the entire document.
 * Assumes specific data attributes and class names.
 */
function initModals() {
    // ... (rest of the initModals function - no changes needed here) ...
    const modalTriggers = document.querySelectorAll('[data-modal-target]');
    const modalContainers = document.querySelectorAll('.modal-container');

    // --- Open Modal Logic ---
    modalTriggers.forEach(trigger => {
        const modalId = trigger.dataset.modalTarget;
        const modal = document.querySelector(modalId);
        if (modal) {
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                modal.classList.remove('hidden');
                modal.classList.add('flex'); // Use flex for centering/positioning defined in modal styles
                document.body.style.overflow = 'hidden'; // Prevent background scrolling

                // Determine animation type based on modal classes or ID (example: bottom sheet vs centered)
                const content = modal.querySelector('.modal-content');
                const overlay = modal.querySelector('.modal-overlay');

                requestAnimationFrame(() => { // Allow display change to take effect before transition
                    if (overlay) overlay.style.opacity = '1'; // Fade in overlay

                    // Handle different modal animation styles
                    if (modalId === '#filter-modal') { // Specific ID for bottom sheet
                        if (content) content.style.transform = 'translateY(0)';
                    } else { // Default centered modal animation
                         if (content) {
                            content.style.opacity = '1';
                            content.style.transform = 'scale(1)';
                         }
                    }
                });
            });
        }
    });

    // --- Close Modal Logic ---
    modalContainers.forEach(modal => {
        const overlay = modal.querySelector('.modal-overlay');
        const closeButtons = modal.querySelectorAll('.modal-close, .modal-close-x');
        const content = modal.querySelector('.modal-content');
        const modalId = '#' + modal.id; // Get the ID for specific animations (add #)


        const closeModal = () => {
            if (overlay) overlay.style.opacity = '0'; // Fade out overlay

            // Handle different modal animation styles
            if (modalId === '#filter-modal') { // Specific ID for bottom sheet
                if (content) content.style.transform = 'translateY(100%)';
            } else { // Default centered modal animation
                if (content) {
                    content.style.opacity = '0';
                    content.style.transform = 'scale(0.95)';
                }
            }

            // Wait for animation before hiding and restoring scroll
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                document.body.style.overflow = ''; // Restore scrolling
            }, 300); // Match animation duration (adjust if needed)
        };

        if (overlay) {
            overlay.addEventListener('click', closeModal);
        }
        closeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                closeModal();
            });
        });
        // Close with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });
    });

    // --- Specific Modal Logic (Example: Filter Payout Slider) ---
    // Keep specific logic like slider updates close to where it's needed,
    // but the core open/close is handled above.
    const payoutRange = document.getElementById('payout-range');
    const payoutValue = document.getElementById('payout-value');
    if (payoutRange && payoutValue) {
        payoutRange.addEventListener('input', () => {
            payoutValue.textContent = payoutRange.value;
        });
    }
}


// --- Initialize Modals on Page Load ---
document.addEventListener('DOMContentLoaded', initModals);