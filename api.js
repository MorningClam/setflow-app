/* =========================================================================
 * Setflow Frontend API Helper
 * ========================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, setDoc, doc, getDoc, getDocs, collection, addDoc, Timestamp, query, where, orderBy, serverTimestamp, updateDoc, onSnapshot, limit, writeBatch, deleteField, deleteDoc, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // Added deleteDoc and enableIndexedDbPersistence
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js"; // Added Functions imports
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js"; // Added App Check import

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

// --- Initialize App Check ---
// IMPORTANT: Replace "YOUR_RECAPTCHA_V3_SITE_KEY" with your actual reCAPTCHA v3 site key
// You can get this from the Google Cloud Console -> Security -> reCAPTCHA Enterprise
// Ensure you have enabled the "Firebase App Check API" in Google Cloud Console.
// Debug token allows testing on localhost/unregistered domains. REMOVE for production.
self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // Set to false or remove for production
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("YOUR_RECAPTCHA_V3_SITE_KEY"), // <-- Replace this key!
  isTokenAutoRefreshEnabled: true
});
console.log("Firebase App Check initialized.");


// Initialize and export Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
const functions = getFunctions(app); // Initialize Functions

// --- Enable Offline Persistence ---
// Call this as early as possible, before any Firestore operations
(async () => {
  try {
    await enableIndexedDbPersistence(db);
    console.log("Firestore offline persistence enabled.");
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore offline persistence failed: Multiple tabs open, persistence can only be enabled in one tab at a time.");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore offline persistence not supported in this browser environment.");
    } else {
      console.error("Firestore offline persistence error:", err);
    }
  }
})();


console.log("Firebase has been initialized.");


// --- Network Status Handling ---
const network = {
  online: navigator.onLine,
  bannerElement: null,

  init: function() {
    // Attempt to find the banner element once the DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        this.bannerElement = document.getElementById('offline-banner');
        this.updateBanner(); // Set initial state based on current navigator.onLine
    });

    window.addEventListener('online', () => this.updateStatus(true));
    window.addEventListener('offline', () => this.updateStatus(false));
  },

  updateStatus: function(isOnline) {
    const wasOffline = !this.online;
    this.online = isOnline;

    if (wasOffline && this.online) {
      if (window.toast) { // Ensure toast is available
        window.toast.show('Back online. Syncing data...', 'success', 2000);
      } else {
        console.log('Back online. Syncing data...');
      }
      // Note: Firestore handles automatic data syncing when connection returns.
      // If specific listeners need manual refreshing, that logic would go here or in the calling page.
    }

    this.updateBanner();
    // Dispatch custom event for components to listen to
    document.body.dispatchEvent(new CustomEvent('app:network-change', { detail: { online: this.online } }));
  },

  updateBanner: function() {
    if (this.bannerElement) {
      this.bannerElement.style.display = this.online ? 'none' : 'block';
    } else {
      // Try finding it again if it wasn't ready during init (should be rare with DOMContentLoaded)
      this.bannerElement = document.getElementById('offline-banner');
       if (this.bannerElement) {
           this.bannerElement.style.display = this.online ? 'none' : 'block';
       }
    }
  },

  isOnline: function() {
    return this.online;
  }
};
// Initialize network status listener immediately
network.init();
export const isOnline = () => network.isOnline();


// --- UI Loading Spinner Helper ---
export const ui = {
    loading: {
        spinnerHtml: '<div class="loading-spinner-container" role="status"><div class="loading-spinner"></div></div>',
        show: function(selectorOrElement) {
            const target = typeof selectorOrElement === 'string' ? document.querySelector(selectorOrElement) : selectorOrElement;
            if (target) {
                target.innerHTML = this.spinnerHtml;
            }
        },
        // hide function might not be strictly needed if content replaces spinner,
        // but included for completeness if needed elsewhere.
        hide: function(selectorOrElement) {
            const target = typeof selectorOrElement === 'string' ? document.querySelector(selectorOrElement) : selectorOrElement;
            const spinner = target ? target.querySelector('.loading-spinner-container') : null;
            if (spinner) {
                spinner.remove();
            }
        },
        createSpinnerElement: function(inline = false) {
             const container = document.createElement('div');
             container.className = inline ? 'inline-block' : 'loading-spinner-container';
             container.setAttribute('role', 'status');
             const spinner = document.createElement('div');
             spinner.className = inline ? 'loading-spinner-inline' : 'loading-spinner';
             container.appendChild(spinner);
             return container;
        }
    }
};

// --- Graceful Firestore Read Helper ---
// Note: Firestore's offline persistence handles caching automatically.
// This helper primarily manages the UI state (showing spinner/offline message)
// and handles potential errors during the initial fetch attempt.
/**
 * Wraps Firestore getDoc/getDocs calls to handle loading and offline states gracefully.
 * @param {Promise<*>} firestorePromise - The promise returned by getDoc or getDocs.
 * @param {HTMLElement|string} loadingContainer - Element or selector where loading spinner/error message should appear.
 * @param {string} offlineMessage - Message to show if offline AND data isn't cached.
 * @returns {Promise<*>} Resolves with Firestore data or rejects with error.
 */
export async function gracefulGet(firestorePromise, loadingContainer = null, offlineMessage = "You are offline. Data may be unavailable.") {
    const containerElement = typeof loadingContainer === 'string' ? document.querySelector(loadingContainer) : loadingContainer;

    // Show loading spinner if container provided
    if (containerElement) {
        containerElement.innerHTML = ''; // Clear previous content
        containerElement.appendChild(ui.loading.createSpinnerElement());
    }

    try {
        const result = await firestorePromise;
        // Data fetched successfully (from cache or server)
        // Caller is responsible for rendering the result and clearing the container
        return result;
    } catch (error) {
        console.error("Firestore read error:", error);
        if (containerElement) {
            if (!isOnline()) {
                // Firestore automatically tries cache first. If it fails AND we're offline,
                // it likely means the data wasn't cached or cache access failed.
                containerElement.innerHTML = `<p class="p-5 text-center text-neutral-500">${offlineMessage}</p>`;
            } else {
                // Online but still got an error (permissions, server issue, etc.)
                containerElement.innerHTML = `<p class="p-5 text-center text-red-400">Error loading data: ${error.message}</p>`;
            }
        }
        throw error; // Re-throw so the caller knows the operation failed
    }
}


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
  // Use gracefulSet equivalent if needed, but setDoc is less likely to fail offline initially
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
    // This inherently requires network connection
    if (!isOnline()) {
        throw new Error("You must be online to send a password reset email.");
    }
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
 * Calls the Firebase Cloud Function to delete the current user's account and associated data.
 * Requires network connection.
 * @returns {Promise<{success: boolean, message: string}>} Result from the Cloud Function.
 */
export async function deleteUserAccount() {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("No user is signed in to delete.");
    }
    if (!isOnline()) {
        throw new Error("You must be online to delete your account.");
    }

    try {
        const deleteAccountAtomic = httpsCallable(functions, 'deleteAccountAtomic');
        const result = await deleteAccountAtomic();
        console.log("Cloud Function result:", result.data);
        return result.data;
    } catch (error) {
        console.error("Error calling deleteAccountAtomic function:", error);
        throw new Error(error.message || "Failed to call account deletion function.");
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

    batch.set(bandRef, { name: bandName, createdAt: serverTimestamp(), members: { [adminUser.uid]: { name: adminUser.displayName || adminUser.email, role: 'admin' } } });
    batch.update(userRef, { [`bands.${bandRef.id}`]: 'admin' });
    // Batch writes work offline and sync later
    return await batch.commit();
}

/**
 * Fetches all bands a user is a member of using the graceful helper.
 * @param {string} userId - The ID of the user.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of band objects.
 */
export async function getBandsForUser(userId, loadingContainer = null) {
    const userData = await gracefulGet(getUserData(userId), loadingContainer, "Cannot load user data offline."); // Use helper
    if (!userData || !userData.bands) return [];

    const bandIds = Object.keys(userData.bands);
    if (bandIds.length === 0) return [];

    // Fetch individual bands. Showing loading state here is complex;
    // rely on the initial userData fetch or handle loading within the caller.
    const bandPromises = bandIds.map(async (bandId) => {
        try {
            // Can't easily show spinner per band, rely on Firestore cache
            const bandDoc = await getDoc(doc(db, "bands", bandId));
            if (bandDoc.exists()) {
                return { id: bandDoc.id, ...bandDoc.data(), role: userData.bands[bandId] };
            }
        } catch (error) {
             console.error(`Error fetching band ${bandId}:`, error);
             // Return null or partial data if offline and cached? Firestore handles this.
        }
        return null;
    });

    const bands = await Promise.all(bandPromises);
    return bands.filter(band => band !== null);
}


/**
 * Fetches a single band's data using the graceful helper.
 * @param {string} bandId - The ID of the band to fetch.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Object>} A promise that resolves with the band's data object.
 */
export async function getBandData(bandId, loadingContainer = null) {
    const bandRef = doc(db, "bands", bandId);
    // Use gracefulGet for the main band document fetch
    const bandSnap = await gracefulGet(getDoc(bandRef), loadingContainer, "Cannot load band data offline.");

    if (!bandSnap.exists()) {
        throw new Error("Band not found.");
    }

    const bandData = bandSnap.data();
    const memberIds = Object.keys(bandData.members);

    // Fetch member data - might show stale data if offline
    const memberPromises = memberIds.map(async (id) => {
        try {
            // Cannot easily show spinner per member here, rely on cache
            const userData = await getUserData(id); // Already uses cache via Firestore
            return { id, name: userData?.name || 'Unknown Member', photoURL: userData?.profileImageUrl || null, role: bandData.members[id].role };
        } catch (error) {
            console.warn(`Could not fetch data for member ${id}:`, error);
            return { id, name: 'Member (Offline?)', photoURL: null, role: bandData.members[id].role }; // Provide fallback
        }
    });

    const members = await Promise.all(memberPromises);
    const memberMap = members.reduce((acc, member) => { acc[member.id] = member; return acc; }, {});

    return { id: bandSnap.id, ...bandData, members: memberMap };
}


/**
 * Invites a user to a band by their email. (Requires network)
 * @param {string} bandId - The ID of the band.
 * @param {string} inviteeEmail - The email of the user to invite.
 * @returns {Promise<void>}
 */
export async function inviteToBand(bandId, inviteeEmail) {
    if (!isOnline()) {
        throw new Error("You must be online to send invites.");
    }
    const q = query(collection(db, "users"), where("email", "==", inviteeEmail));
    const userSnapshot = await getDocs(q); // Requires network

    if (userSnapshot.empty) throw new Error("User with that email does not exist.");
    const inviteeId = userSnapshot.docs[0].id;

    const inviteRef = doc(collection(db, "invitations"));
    return await setDoc(inviteRef, { bandId: bandId, inviteeId: inviteeId, status: 'pending', createdAt: serverTimestamp() });
}

/**
 * Removes a member from a band. Works offline.
 * @param {string} bandId - The ID of the band.
 * @param {string} memberId - The ID of the member to remove.
 * @returns {Promise<void>}
 */
export async function removeMemberFromBand(bandId, memberId) {
    const bandRef = doc(db, "bands", bandId);
    const userRef = doc(db, "users", memberId);
    const batch = writeBatch(db);
    batch.update(bandRef, { [`members.${memberId}`]: deleteField() });
    batch.update(userRef, { [`bands.${bandId}`]: deleteField() });
    return await batch.commit(); // Works offline
}


// --- USER DATA & PROFILE FUNCTIONS ---

/**
 * Fetches a user's data from the Firestore 'users' collection using graceful helper.
 * @param {string} userId - The unique ID of the user.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Object|null>} A promise that resolves with the user's data object or null if not found.
 */
export async function getUserData(userId, loadingContainer = null) {
  if (!userId) {
       console.error("getUserData called with null or undefined userId");
       if (loadingContainer) {
            const container = typeof loadingContainer === 'string' ? document.querySelector(loadingContainer) : loadingContainer;
            if (container) container.innerHTML = `<p class="p-5 text-center text-red-400">Error: Invalid user ID.</p>`;
       }
       return null;
  }
  const userDocRef = doc(db, "users", userId);
  // Use gracefulGet helper
  const userDocSnap = await gracefulGet(getDoc(userDocRef), loadingContainer, "Could not load user data while offline.");

  if (userDocSnap.exists()) {
    return { id: userDocSnap.id, ...userDocSnap.data() };
  } else {
    console.warn("No user data found for ID:", userId); // Warn instead of error for cache misses etc.
    // If using loadingContainer, gracefulGet will have already shown an error/offline message.
    return null;
  }
}


/**
 * Updates a user's profile data in their document. Works offline.
 * @param {string} userId - The ID of the user to update.
 * @param {object} profileData - An object containing the fields to update (e.g., { name: 'New Name', bio: 'New Bio' }).
 * @returns {Promise<void>}
 */
export async function updateUserProfile(userId, profileData) {
  if (!userId) throw new Error("User ID is required to update a profile.");
  const userDocRef = doc(db, "users", userId);
  return await updateDoc(userDocRef, profileData); // Works offline
}

/**
 * Updates a user's preferences data in their document. Works offline.
 * @param {string} userId - The ID of the user to update.
 * @param {object} preferencesData - An object containing the fields to update (e.g., { travelRadius: 100 }).
 * @returns {Promise<void>}
 */
export async function updateUserPreferences(userId, preferencesData) {
  if (!userId) throw new Error("User ID is required to update preferences.");
  const userDocRef = doc(db, "users", userId);
  return await updateDoc(userDocRef, preferencesData); // Works offline
}


// --- GIG & APPLICATION FUNCTIONS ---

/**
 * Fetches all gigs from the 'gigs' collection using graceful helper.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of gig documents.
 */
export async function fetchGigs(loadingContainer = null) {
  const querySnapshot = await gracefulGet(getDocs(collection(db, "gigs")), loadingContainer, "Could not load gigs while offline.");
  const gigs = [];
  querySnapshot.forEach((doc) => {
    const gigData = doc.data();
    // Ensure date exists and is a Firestore Timestamp before converting
    const date = gigData.date && gigData.date.toDate ? gigData.date.toDate().toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    }) : 'Date unavailable';
    gigs.push({ id: doc.id, ...gigData, formattedDate: date });
  });
  return gigs;
}

/**
 * Creates a new event in the 'calendarEvents' collection. Works offline.
 * @param {object} eventData - The data for the event.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createCalendarEvent(eventData) {
  const dateTimeString = `${eventData.date}T${eventData.time}`;
  const eventTimestamp = Timestamp.fromDate(new Date(dateTimeString));
  const eventToSave = { userId: eventData.userId, title: eventData.title, type: eventData.type, date: eventTimestamp, notes: eventData.notes };
  return await addDoc(collection(db, "calendarEvents"), eventToSave); // Works offline
}

/**
 * Fetches all calendar events for a specific user using graceful helper.
 * @param {string} userId - The ID of the user whose events to fetch.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of event documents.
 */
export async function fetchCalendarEvents(userId, loadingContainer = null) {
  const eventsCollectionRef = collection(db, "calendarEvents");
  const q = query(eventsCollectionRef, where("userId", "==", userId), orderBy("date", "asc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load calendar while offline.");
  const events = [];
  querySnapshot.forEach((doc) => {
    const eventData = doc.data();
    const date = eventData.date?.toDate ? eventData.date.toDate() : new Date(); // Fallback date
    events.push({
      id: doc.id, ...eventData,
      formattedDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      formattedTime: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    });
  });
  return events;
}

/**
 * Creates a new application document. Works offline.
 * @param {string} gigId - The ID of the gig being applied for.
 * @param {string} userId - The ID of the user applying.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function applyForGig(gigId, userId) {
  if (!gigId || !userId) throw new Error("Gig ID and User ID are required to apply.");
  const applicationData = { gigId: gigId, userId: userId, status: 'applied', appliedAt: serverTimestamp() };
  return await addDoc(collection(db, "applications"), applicationData); // Works offline
}

/**
 * Fetches all applications for a specific user using graceful helper.
 * @param {string} userId - The ID of the user whose applications to fetch.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of combined application and gig data.
 */
export async function fetchMyApplications(userId, loadingContainer = null) {
  const applicationsRef = collection(db, "applications");
  const q = query(applicationsRef, where("userId", "==", userId));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load applications while offline.");

  if (querySnapshot.empty) return [];

  const applicationPromises = querySnapshot.docs.map(async (appDoc) => {
    const applicationData = appDoc.data();
    try {
        const gigDocRef = doc(db, "gigs", applicationData.gigId);
        // Rely on cache for gig data; can't easily show spinner per application row
        const gigDocSnap = await getDoc(gigDocRef);
        if (gigDocSnap.exists()) {
            const gigData = gigDocSnap.data();
            const date = gigData.date?.toDate ? gigData.date.toDate().toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            }) : 'Date N/A';
            return { ...applicationData, id: appDoc.id, gigVenue: gigData.venueName, gigGenre: gigData.genre, gigDate: date };
        }
    } catch (error) {
        console.warn(`Could not fetch gig details for application ${appDoc.id}:`, error);
        // Return partial data if gig fetch fails (e.g., offline no cache)
         return { ...applicationData, id: appDoc.id, gigVenue: 'Gig Details Unavailable', gigGenre: '', gigDate: '' };
    }
    return null;
  });

  const applications = await Promise.all(applicationPromises);
  return applications.filter(app => app !== null);
}


/**
 * Fetches all applicants for a specific gig using graceful helper.
 * @param {string} gigId - The ID of the gig to fetch applicants for.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of applicant user data.
 */
export async function fetchApplicantsForGig(gigId, loadingContainer = null) {
  if (!gigId) throw new Error("Gig ID is required to fetch applicants.");

  const applicationsRef = collection(db, "applications");
  const q = query(applicationsRef, where("gigId", "==", gigId));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load applicants while offline.");

  if (querySnapshot.empty) return [];

  const applicantPromises = querySnapshot.docs.map(async (appDoc) => {
    const applicantId = appDoc.data().userId;
    try {
        // Rely on cache for user data here
        const userData = await getUserData(applicantId); // Uses cache via Firestore
        return userData ? { ...userData, id: applicantId } : null; // Ensure ID is included
    } catch (error) {
        console.warn(`Could not fetch data for applicant ${applicantId}:`, error);
        return { id: applicantId, name: 'Applicant (Offline?)' }; // Fallback data
    }
  });

  const applicants = await Promise.all(applicantPromises);
  return applicants.filter(applicant => applicant !== null);
}


/**
 * Fetches all gigs for a specific owner using graceful helper.
 * @param {string} userId - The ID of the user whose gigs to fetch.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of gig documents.
 */
export async function fetchGigsForOwner(userId, loadingContainer = null) {
  if (!userId) throw new Error("User ID is required.");

  const gigsRef = collection(db, "gigs");
  const q = query(gigsRef, where("ownerId", "==", userId), orderBy("date", "desc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load your gigs while offline.");
  const gigs = [];

  for (const docSnap of querySnapshot.docs) { // Use docs directly from snapshot
    const gigData = docSnap.data();
    let applicantCount = 0;
    try {
        // Fetch applicant count - might be stale if offline
        const appsRef = collection(db, "applications");
        const appsQuery = query(appsRef, where("gigId", "==", docSnap.id));
        // Note: Using getDocs here will hit cache if offline. Consider countFromServer if accuracy needed online.
        const appsSnapshot = await getDocs(appsQuery);
        applicantCount = appsSnapshot.size;
    } catch (error) {
        console.warn(`Could not get applicant count for gig ${docSnap.id}:`, error);
        // Keep applicantCount = 0 if fetch fails
    }

    const date = gigData.date?.toDate ? gigData.date.toDate().toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric'
    }) : 'Date N/A';

    gigs.push({ id: docSnap.id, ...gigData, applicantCount: applicantCount, formattedDate: date });
  }
  return gigs;
}


/**
 * Creates a new gig document. Works offline.
 * @param {object} gigData - The data for the new gig.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createGig(gigData) {
  if (!gigData.ownerId) throw new Error("An ownerId must be provided.");
  const eventTimestamp = Timestamp.fromDate(new Date(gigData.date));
  const gigToSave = { ownerId: gigData.ownerId, venueName: gigData.eventName, location: gigData.location, date: eventTimestamp, payout: Number(gigData.payout), description: gigData.description, status: 'open', createdAt: serverTimestamp() };
  return await addDoc(collection(db, "gigs"), gigToSave); // Works offline
}


// --- GEAR LISTING FUNCTIONS ---

/**
 * Creates a new gear listing. Works offline.
 * @param {object} itemData - The data for the item being listed.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createGearListing(itemData) {
  if (!itemData.sellerId) throw new Error("A sellerId must be provided.");
  const itemToSave = { ...itemData, createdAt: serverTimestamp() };
  return await addDoc(collection(db, "gear_listings"), itemToSave); // Works offline
}

/**
 * Fetches all gear listings using graceful helper.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of gear listing documents.
 */
export async function fetchGearListings(loadingContainer = null) {
  const listingsRef = collection(db, "gear_listings");
  const q = query(listingsRef, orderBy("createdAt", "desc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load gear while offline.");
  const listings = [];
  querySnapshot.forEach((doc) => { listings.push({ id: doc.id, ...doc.data() }); });
  return listings;
}

/**
 * Fetches a single gear listing using graceful helper.
 * @param {string} listingId - The ID of the gear listing to fetch.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Object|null>}
 */
export async function getGearListing(listingId, loadingContainer = null) {
    if (!listingId) return null;
    const listingRef = doc(db, "gear_listings", listingId);
    const listingSnap = await gracefulGet(getDoc(listingRef), loadingContainer, "Could not load item details offline.");

    if (listingSnap.exists()) {
        const listingData = listingSnap.data();
        let sellerName = "Unknown Seller";
        let sellerProfileImageUrl = null;
        try {
            // Fetch seller data, relying on cache if offline
            const sellerData = await getUserData(listingData.sellerId);
            if (sellerData) {
                sellerName = sellerData.name;
                sellerProfileImageUrl = sellerData.profileImageUrl;
            }
        } catch (error) {
            console.warn(`Could not fetch seller details for listing ${listingId}:`, error);
            sellerName = "Seller (Offline?)";
        }
        return { id: listingSnap.id, ...listingData, sellerName, sellerProfileImageUrl };
    }
    // If loadingContainer used, gracefulGet handled the message
    return null;
}


// --- PLAYER POST FUNCTIONS ---

/**
 * Creates a new player post. Works offline.
 * @param {object} postData - The data for the post.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createPlayerPost(postData) {
  if (!postData.userId) throw new Error("A userId must be provided.");
  const postToSave = { ...postData, createdAt: serverTimestamp() };
  return await addDoc(collection(db, "player_posts"), postToSave); // Works offline
}

/**
 * Fetches all player posts using graceful helper.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of player post documents with user info.
 */
export async function fetchPlayerPosts(loadingContainer = null) {
  const postsRef = collection(db, "player_posts");
  const q = query(postsRef, orderBy("createdAt", "desc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load posts while offline.");
  const posts = [];
  for (const postDoc of querySnapshot.docs) {
    const postData = postDoc.data();
    let userName = 'Unknown User';
    let userProfileImage = null;
    try {
        // Fetch user data, rely on cache if offline
        const userData = await getUserData(postData.userId); // Uses cache
        if(userData) {
             userName = userData.name;
             userProfileImage = userData.profileImageUrl;
        }
    } catch(error) {
        console.warn(`Could not fetch user details for post ${postDoc.id}:`, error);
        userName = 'User (Offline?)';
    }
    posts.push({ id: postDoc.id, ...postData, userName, userProfileImage });
  }
  return posts;
}


// --- BOOKING & REVIEW FUNCTIONS ---

/**
 * Confirms a booking. Works offline.
 * @param {string} gigId - The ID of the gig to confirm.
 * @param {string} artistId - The ID of the artist being booked.
 * @param {string} artistName - The name of the artist being booked.
 * @returns {Promise<void>}
 */
export async function confirmBooking(gigId, artistId, artistName) {
  if (!gigId || !artistId || !artistName) throw new Error("Required info missing for booking.");
  const gigDocRef = doc(db, "gigs", gigId);
  return await updateDoc(gigDocRef, { status: 'booked', bookedArtistId: artistId, bookedArtistName: artistName }); // Works offline
}

/**
 * Creates a new review. Works offline.
 * @param {object} reviewData - The data for the review.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createReview(reviewData) {
  if (!reviewData.reviewerId || !reviewData.subjectId || !reviewData.gigId) throw new Error("Required info missing for review.");
  const reviewToSave = { ...reviewData, createdAt: serverTimestamp() };
  return await addDoc(collection(db, "reviews"), reviewToSave); // Works offline
}


// --- JAM SESSION FUNCTIONS ---

/**
 * Creates a new jam session. Works offline.
 * @param {object} sessionData - The data for the jam session.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createJamSession(sessionData) {
  if (!sessionData.hostId) throw new Error("A hostId must be provided.");
  const dateTimeString = `${sessionData.date}T${sessionData.time}`;
  const sessionTimestamp = Timestamp.fromDate(new Date(dateTimeString));
  const sessionToSave = { hostId: sessionData.hostId, title: sessionData.title, location: sessionData.location, dateTime: sessionTimestamp, description: sessionData.description, createdAt: serverTimestamp() };
  return await addDoc(collection(db, "jam_sessions"), sessionToSave); // Works offline
}

/**
 * Fetches all jam sessions using graceful helper.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of jam session documents with host info.
 */
export async function fetchJamSessions(loadingContainer = null) {
  const sessionsRef = collection(db, "jam_sessions");
  const q = query(sessionsRef, orderBy("dateTime", "asc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load sessions while offline.");
  const sessions = [];
  for (const sessionDoc of querySnapshot.docs) {
    const sessionData = sessionDoc.data();
    let hostName = 'Unknown Host';
    let hostProfileImage = null;
    try {
        // Fetch host data, rely on cache if offline
        const hostData = await getUserData(sessionData.hostId); // Uses cache
        if (hostData) {
             hostName = hostData.name;
             hostProfileImage = hostData.profileImageUrl;
        }
    } catch(error) {
         console.warn(`Could not fetch host details for session ${sessionDoc.id}:`, error);
         hostName = 'Host (Offline?)';
    }
    const date = sessionData.dateTime?.toDate ? sessionData.dateTime.toDate() : new Date();
    sessions.push({
      id: sessionDoc.id, ...sessionData, hostName, hostProfileImage,
      formattedDate: date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
      formattedTime: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    });
  }
  return sessions;
}


// --- MESSAGING FUNCTIONS ---
// Note: Real-time listeners (onSnapshot) behave differently offline. They will
// initially receive cached data and then update when the connection returns.
// Sending messages works offline and syncs later.

/**
 * Creates or retrieves a conversation. Works offline for retrieval if cached.
 * @param {string} userId1 - The ID of the current user.
 * @param {string} userId2 - The ID of the other user.
 * @returns {Promise<string>} The ID of the conversation.
 */
export async function createOrGetConversation(userId1, userId2) {
  const conversationId = [userId1, userId2].sort().join('_');
  const conversationRef = doc(db, "conversations", conversationId);
  // Get (will use cache if offline)
  const conversationSnap = await getDoc(conversationRef);
  if (!conversationSnap.exists()) {
    // Set will work offline
    await setDoc(conversationRef, { participants: [userId1, userId2], createdAt: serverTimestamp() });
  }
  return conversationId;
}

/**
 * Sends a message. Works offline.
 * @param {string} conversationId - The ID of the conversation.
 * @param {object} messageData - The message object { text, senderId }.
 * @returns {Promise<void>}
 */
export async function sendMessage(conversationId, messageData) {
  const messagesRef = collection(db, "conversations", conversationId, "messages");
  const conversationRef = doc(db, "conversations", conversationId);
  const batch = writeBatch(db);
  batch.set(doc(messagesRef), { ...messageData, timestamp: serverTimestamp() });
  batch.update(conversationRef, { lastMessage: { text: messageData.text, senderId: messageData.senderId, timestamp: serverTimestamp() } });
  return await batch.commit(); // Works offline
}

/**
 * Listens for real-time messages. Provides cached data first when offline.
 * @param {string} conversationId - The ID of the conversation.
 * @param {function} callback - Function called with messages array (receives updates).
 * @param {function} [errorCallback] - Optional function called on listener error.
 * @returns {import("firebase/firestore").Unsubscribe} A function to unsubscribe.
 */
export function getMessages(conversationId, callback, errorCallback = console.error) {
  const messagesRef = collection(db, "conversations", conversationId, "messages");
  const q = query(messagesRef, orderBy("timestamp", "asc"));
  return onSnapshot(q, (querySnapshot) => {
    const messages = [];
    querySnapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    // Check for metadata changes to detect offline/online transitions if needed
    // const source = querySnapshot.metadata.fromCache ? "local cache" : "server";
    // console.log("Messages data came from:", source);
    callback(messages);
  }, errorCallback); // Pass error callback
}

/**
 * Fetches all conversations using graceful helper.
 * @param {string} userId - The ID of the current user.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of conversation objects.
 */
export async function getConversations(userId, loadingContainer = null) {
  const convosRef = collection(db, "conversations");
  const q = query(convosRef, where("participants", "array-contains", userId));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load messages while offline.");

  const conversationPromises = querySnapshot.docs.map(async (convoDoc) => {
    const convoData = convoDoc.data();
    const otherParticipantId = convoData.participants.find(id => id !== userId);
    if (!otherParticipantId) return null;

    let otherUserName = 'Unknown User';
    let otherUserImage = null;
    try {
        // Fetch user data, rely on cache if offline
        const otherUserData = await getUserData(otherParticipantId); // Uses cache
        if(otherUserData){
             otherUserName = otherUserData.name;
             otherUserImage = otherUserData.profileImageUrl;
        }
    } catch (error) {
         console.warn(`Could not fetch other user data for convo ${convoDoc.id}:`, error);
         otherUserName = 'User (Offline?)';
    }

    let lastMessage = convoData.lastMessage || { text: 'No messages yet...', timestamp: convoData.createdAt };

    return { id: convoDoc.id, ...convoData, otherUserName, otherUserImage, otherUserId: otherParticipantId, lastMessage };
  });

  const conversations = (await Promise.all(conversationPromises)).filter(c => c !== null);
  conversations.sort((a, b) => (b.lastMessage.timestamp?.toDate() || 0) - (a.lastMessage.timestamp?.toDate() || 0));
  return conversations;
}


// --- BAND JOIN REQUEST FUNCTIONS ---

/**
 * Creates a request to join a band. Works offline.
 * @param {string} bandId - The ID of the band to join.
 * @param {string} userId - The ID of the user requesting to join.
 * @returns {Promise<void>}
 */
export async function requestToJoinBand(bandId, userId) {
    const requestRef = doc(collection(db, "join_requests"));
    return await setDoc(requestRef, { bandId: bandId, userId: userId, status: 'pending', createdAt: serverTimestamp() }); // Works offline
}

/**
 * Fetches pending join requests using graceful helper.
 * @param {string} bandId - The ID of the band.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of request objects.
 */
export async function getJoinRequests(bandId, loadingContainer = null) {
    const requestsRef = collection(db, "join_requests");
    const q = query(requestsRef, where("bandId", "==", bandId), where("status", "==", "pending"));
    const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load join requests offline.");
    const requests = [];

    for (const docSnap of querySnapshot.docs) {
        const requestData = docSnap.data();
        let userName = 'User (Offline?)';
        try {
            // Fetch user data, rely on cache if offline
            const userData = await getUserData(requestData.userId); // Uses cache
            if (userData) userName = userData.name;
        } catch (error) {
            console.warn(`Could not fetch user data for join request ${docSnap.id}:`, error);
        }
        requests.push({ id: docSnap.id, ...requestData, userName });
    }
    return requests;
}

/**
 * Approves a join request. Works offline.
 * @param {string} requestId - The ID of the join request to approve.
 * @returns {Promise<void>}
 */
export async function approveJoinRequest(requestId) {
    const requestRef = doc(db, "join_requests", requestId);
    // Get request data (uses cache if offline)
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) throw new Error("Request not found.");

    const { bandId, userId } = requestSnap.data();
    // Get user data (uses cache if offline)
    const userData = await getUserData(userId); // Need name

    const bandRef = doc(db, "bands", bandId);
    const userRef = doc(db, "users", userId);
    const batch = writeBatch(db);
    batch.update(bandRef, { [`members.${userId}`]: { name: userData?.name || 'New Member', role: 'member' } });
    batch.update(userRef, { [`bands.${bandId}`]: 'member' });
    batch.update(requestRef, { status: 'approved' });
    return await batch.commit(); // Works offline
}


// --- PLAYER DISCOVERY FUNCTIONS ---

/**
 * Fetches available players using graceful helper.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of user objects.
 */
export async function getAvailablePlayers(loadingContainer = null) {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("isLookingForBands", "==", true));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load players offline.");
  const players = [];
  querySnapshot.forEach((doc) => { players.push({ id: doc.id, ...doc.data() }); });
  return players;
}

/**
 * Fetches all players using graceful helper.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of user objects.
 */
export async function getAllPlayers(loadingContainer = null) {
  const usersRef = collection(db, "users");
  const querySnapshot = await gracefulGet(getDocs(usersRef), loadingContainer, "Could not load players offline.");
  const players = [];
  querySnapshot.forEach((doc) => { players.push({ id: doc.id, ...doc.data() }); });
  return players;
}

/**
 * Fetches all bands using graceful helper.
 * @param {HTMLElement|string} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array>} A promise that resolves to an array of band objects.
 */
export async function getAllBands(loadingContainer = null) {
    const bandsRef = collection(db, "bands");
    const q = query(bandsRef, orderBy("name"));
    const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load bands offline.");
    const bands = [];
    querySnapshot.forEach((doc) => { bands.push({ id: doc.id, ...doc.data() }); });
    return bands;
}

/**
 * Creates a report document. Works offline.
 * @param {string} reportedItemId - ID of the item being reported.
 * @param {string} reportedItemType - Type of item ('user', 'gig', 'gear_listing', etc.).
 * @param {string} reporterId - User ID of the reporter.
 * @param {string} [reason] - Optional reason.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function reportContent(reportedItemId, reportedItemType, reporterId, reason = 'N/A') {
  if (!reportedItemId || !reportedItemType || !reporterId) throw new Error("Missing required fields for report.");
  const reportData = { reportedItemId, reportedItemType, reporterId, reason, status: 'pending', createdAt: serverTimestamp() };
  return await addDoc(collection(db, "reports"), reportData); // Works offline
}