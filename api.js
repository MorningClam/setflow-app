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
    if (wasOffline && this.online && window.toast) {
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
 * @returns {Promise<*|null>} Firestore result or null.
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
        // Return null instead of throwing if preferred:
        // return null;
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
    // ... (logic remains the same, uses httpsCallable) ...
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
    // ... (logic remains the same, requires network) ...
    if (!isOnline()) throw new Error("Invites require connection.");
    const q = query(collection(db, "users"), where("email", "==", inviteeEmail));
    const userSnapshot = await getDocs(q); // Network needed
    if (userSnapshot.empty) throw new Error("User not found.");
    // ... (rest of checks and setDoc) ...
    const inviteeId = userSnapshot.docs[0].id;
    const inviteeName = userSnapshot.docs[0].data().name || inviteeEmail;
    const bandSnap = await getDoc(doc(db, "bands", bandId)); // Cache potentially used
    if (bandSnap.exists() && bandSnap.data().members?.[inviteeId]) throw new Error(`${inviteeName} is already a member.`);
    const inviteRef = doc(collection(db, "invitations"));
    const bandName = bandSnap.exists() ? bandSnap.data().name : 'Unknown Band';
    return await setDoc(inviteRef, { bandId, bandName, inviteeId, inviteeName, status: 'pending', createdAt: serverTimestamp() }); // Works offline after first connection
}

export async function removeMemberFromBand(bandId, memberId) {
    // ... (logic remains the same, uses writeBatch) ...
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
            const userData = await getUserData(requestData.userId, null); // No container
            if (userData) userName = userData.name || 'Name Unavailable';
        } catch(error) { console.warn(`Could not fetch user data for join request ${docSnap.id}:`, error); userName = 'User (Error)'; }
        return { id: docSnap.id, ...requestData, userName };
    });
    return await Promise.all(requestProcessingPromises);
}

export async function approveJoinRequest(requestId) {
     // ... (logic remains the same, uses writeBatch) ...
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
  // ... (logic remains the same, uses updateDoc) ...
  if (!userId) throw new Error("User ID required.");
  const userDocRef = doc(db, "users", userId);
  profileData.updatedAt = serverTimestamp();
  return await updateDoc(userDocRef, profileData); // Works offline
}

export async function updateUserPreferences(userId, preferencesData) {
  // ... (logic remains the same, uses updateDoc) ...
    if (!userId) throw new Error("User ID required.");
    const userDocRef = doc(db, "users", userId);
    preferencesData.updatedAt = serverTimestamp();
    return await updateDoc(userDocRef, preferencesData); // Works offline
}

// --- GIG & APPLICATION FUNCTIONS ---

// NOTE: Fetching ALL gigs might be inefficient. Consider adding filters (date, location).
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

export async function createCalendarEvent(eventData) {
  // ... (logic remains the same, uses addDoc, converts date/time) ...
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
        events.push({
          id: doc.id, ...eventData,
          dateObject: dateObj,
          formattedDate: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          formattedTime: dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        });
    }
  });
  return events;
}

export async function applyForGig(gigId, userId) {
  // ... (logic remains the same, uses writeBatch) ...
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
  // ... (logic remains the same, uses addDoc, converts date) ...
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
        status: 'open', createdAt: serverTimestamp()
    };
    return await addDoc(collection(db, "gigs"), gigToSave); // Works offline
}

// --- GEAR LISTING FUNCTIONS ---

export async function createGearListing(itemData) {
  // ... (logic remains the same, uses addDoc) ...
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

export async function createPlayerPost(postData) {
  // ... (logic remains the same, uses addDoc) ...
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

export async function confirmBooking(gigId, artistId, artistName) {
  // ... (logic remains the same, uses updateDoc) ...
    if (!gigId || !artistId || !artistName) throw new Error("Required info missing.");
    return await updateDoc(doc(db, "gigs", gigId), {
        status: 'booked', bookedArtistId: artistId, bookedArtistName: artistName,
        bookedAt: serverTimestamp()
    }); // Works offline
}

export async function createReview(reviewData) {
  // ... (logic remains the same, uses addDoc) ...
    if (!reviewData.reviewerId || !reviewData.subjectId || !reviewData.gigId || !reviewData.type) throw new Error("Required info missing.");
    reviewData.rating = Number(reviewData.rating);
    const reviewToSave = { ...reviewData, createdAt: serverTimestamp() };
    return await addDoc(collection(db, "reviews"), reviewToSave); // Works offline
}

// --- JAM SESSION FUNCTIONS ---

export async function createJamSession(sessionData) {
  // ... (logic remains the same, uses addDoc, converts date/time) ...
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

export async function createOrGetConversation(userId1, userId2) {
  // ... (logic remains the same, uses getDoc/setDoc) ...
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
  // ... (logic remains the same, uses writeBatch) ...
    const batch = writeBatch(db);
    const newMessageRef = doc(collection(db, "conversations", conversationId, "messages"));
    batch.set(newMessageRef, { ...messageData, timestamp: serverTimestamp() });
    batch.update(doc(db, "conversations", conversationId), {
        lastMessage: { text: messageData.text, senderId: messageData.senderId, timestamp: serverTimestamp() }
     });
    return await batch.commit(); // Works offline
}

export function getMessages(conversationId, callback, errorCallback = console.error) {
  // ... (logic remains the same, uses onSnapshot) ...
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
  // ... (logic remains the same, uses addDoc) ...
    if (!reportedItemId || !reportedItemType || !reporterId) throw new Error("Missing fields for report.");
    const reportData = { reportedItemId, reportedItemType, reporterId, reason, status: 'pending', createdAt: serverTimestamp() };
    return await addDoc(collection(db, "reports"), reportData); // Works offline
}

// --- PLAYER DISCOVERY ---

export async function getAllPlayers() { // Removed loadingContainer
  // WARNING: Fetching ALL users is inefficient for large scale. Use pagination/indexing.
  const q = query(collection(db, "users"), orderBy("name")); // Add index for name
  // Use gracefulGet
  const querySnapshot = await gracefulGet(getDocs(q), "Could not load players.");
  if (!querySnapshot) return null;
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getAllBands() { // Removed loadingContainer
    // WARNING: Fetching ALL bands is inefficient.
    const q = query(collection(db, "bands"), orderBy("name")); // Add index for name
    // Use gracefulGet
    const querySnapshot = await gracefulGet(getDocs(q), "Could not load bands.");
    if (!querySnapshot) return null;
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}