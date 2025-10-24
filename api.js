/* =========================================================================
 * Setflow Frontend API Helper
 * ========================================================================= */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, setDoc, doc, getDoc, getDocs, collection, addDoc, Timestamp, query, where, orderBy, serverTimestamp, updateDoc, onSnapshot, limit, writeBatch, deleteField, deleteDoc, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // Added deleteDoc and enableIndexedDbPersistence
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js"; // Added Functions imports
import { initializeAppCheck } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js"; // Removed ReCaptchaV3Provider

// Your web app's Firebase configuration
// IMPORTANT: It's generally recommended to load this from a config file or environment variables
// rather than hardcoding, but for this static prototype, it's included here.
const firebaseConfig = {
  apiKey: "AIzaSyCsgE4N9TIud4Udydkb9lF0u1EynG8lCX8", // Use your actual API key
  authDomain: "setflow-app.firebaseapp.com",
  projectId: "setflow-app",
  storageBucket: "setflow-app.appspot.com",
  messagingSenderId: "664998437827",
  appId: "1:664998437827:web:1987f8c1f78c3ad8ad9376",
  measurementId: "G-M9TBBN7945" // Optional: If you use Analytics
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// --- (Web-specific App Check removed) ---
// Native Android/iOS App Check is configured in the Firebase Console
// and initialized via the native SDKs, not here in the JS.
console.log("Firebase App Check for native apps is handled by the native SDKs.");


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
 * IMPORTANT: It returns the Firestore result directly (DocumentSnapshot, QuerySnapshot, etc.) or null on error/offline without cache.
 * @param {Promise<*>} firestorePromise - The promise returned by getDoc or getDocs.
 * @param {HTMLElement|string|null} loadingContainer - Element or selector where loading spinner/error message should appear. If null, no UI updates.
 * @param {string} [offlineMessage="You are offline. Data may be unavailable."] - Message to show if offline AND data isn't cached.
 * @param {string} [errorMessage="Error loading data."] - Generic error message base.
 * @returns {Promise<*|null>} Resolves with Firestore result or null if an error occurred handled by this function.
 */
export async function gracefulGet(firestorePromise, loadingContainer = null, offlineMessage = "You are offline. Data may be unavailable.", errorMessage = "Error loading data.") {
    const containerElement = typeof loadingContainer === 'string' ? document.querySelector(loadingContainer) : loadingContainer;

    // Show loading spinner if container provided
    if (containerElement) {
        containerElement.innerHTML = ''; // Clear previous content
        containerElement.appendChild(ui.loading.createSpinnerElement());
    }

    try {
        const result = await firestorePromise;
        // Data fetched successfully (from cache or server)
        // Remove spinner *only if* we were managing this container
        if (containerElement) {
             const spinner = containerElement.querySelector('.loading-spinner-container');
             if (spinner) spinner.remove();
        }
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
                containerElement.innerHTML = `<p class="p-5 text-center text-red-400">${errorMessage}: ${error.message}</p>`;
            }
        }
        // Return null to signal failure to the caller when handling UI here
        return null;
        // Or re-throw if callers need to handle specific errors differently:
        // throw error;
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
  // Requires network connection
  if (!isOnline()) {
        throw new Error("Login requires an internet connection.");
  }
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
   // Requires network connection
   if (!isOnline()) {
        throw new Error("Sign up requires an internet connection.");
   }
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  // Use gracefulSet equivalent if needed, but setDoc is less likely to fail offline initially
  // setDoc works offline after initial connection
  await setDoc(doc(db, "users", user.uid), {
    name: name,
    email: email,
    roles: [role.toLowerCase()],
    bands: {},
    createdAt: serverTimestamp() // Add creation timestamp
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
        // Assuming the function returns { success: boolean, message: string }
        if (result.data && result.data.success) {
            return result.data;
        } else {
            throw new Error(result.data?.message || "Account deletion failed on the server.");
        }
    } catch (error) {
        console.error("Error calling deleteAccountAtomic function:", error);
        // Handle specific function errors if needed (e.g., permission denied)
        throw new Error(error.message || "Failed to call account deletion function.");
    }
}


// --- BAND MANAGEMENT FUNCTIONS ---

/**
 * Creates a new band and assigns the creator as the admin.
 * @param {string} bandName - The name of the new band.
 * @param {object} adminUser - The user object of the creator (needs uid, displayName, email).
 * @returns {Promise<void>}
 */
export async function createBand(bandName, adminUser) {
    const bandRef = doc(collection(db, "bands"));
    const userRef = doc(db, "users", adminUser.uid);
    const batch = writeBatch(db);

    // Store basic admin info in the band document
    batch.set(bandRef, {
        name: bandName,
        createdAt: serverTimestamp(),
        members: {
            [adminUser.uid]: {
                name: adminUser.displayName || adminUser.email || 'Admin', // Use best available name
                role: 'admin',
                joinedAt: serverTimestamp()
             }
        }
     });
     // Update the user's document to link them to the band
    batch.update(userRef, { [`bands.${bandRef.id}`]: 'admin' });
    // Batch writes work offline and sync later
    return await batch.commit();
}

/**
 * Fetches all bands a user is a member of using the graceful helper.
 * @param {string} userId - The ID of the user.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state (usually null here).
 * @returns {Promise<Array|null>} A promise that resolves to an array of band objects or null on error.
 */
export async function getBandsForUser(userId, loadingContainer = null) {
    // Fetch user data first to get the list of band IDs
    // Pass loading container here if this is the primary data load for the UI section
    const userSnap = await gracefulGet(getDoc(doc(db, "users", userId)), loadingContainer, "Cannot load user data offline.");
    if (!userSnap || !userSnap.exists()) return null; // Error handled by gracefulGet or user not found

    const userData = userSnap.data();
    if (!userData || !userData.bands) return []; // User exists but has no bands field

    const bandIds = Object.keys(userData.bands);
    if (bandIds.length === 0) return [];

    // Fetch individual band documents
    const bandPromises = bandIds.map(async (bandId) => {
        try {
            // Can't easily show spinner per band, rely on Firestore cache
            const bandDoc = await getDoc(doc(db, "bands", bandId));
            if (bandDoc.exists()) {
                // Return band data along with the user's role in that band
                return { id: bandDoc.id, ...bandDoc.data(), role: userData.bands[bandId] };
            } else {
                console.warn(`Band document ${bandId} not found, but user has reference.`);
                return null; // Handle missing band doc gracefully
            }
        } catch (error) {
             console.error(`Error fetching band ${bandId}:`, error);
             // Return null to indicate failure for this specific band
             return null;
        }
    });

    const bands = await Promise.all(bandPromises);
    // Filter out any null results from failed fetches or missing docs
    return bands.filter(band => band !== null);
}


/**
 * Fetches a single band's data using the graceful helper.
 * @param {string} bandId - The ID of the band to fetch.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Object|null>} A promise that resolves with the band's data object or null on error.
 */
export async function getBandData(bandId, loadingContainer = null) {
    const bandRef = doc(db, "bands", bandId);
    // Use gracefulGet for the main band document fetch
    const bandSnap = await gracefulGet(getDoc(bandRef), loadingContainer, "Cannot load band data offline.");

    if (!bandSnap || !bandSnap.exists()) {
        // gracefulGet handled the error message in container if provided
        return null;
    }

    const bandData = bandSnap.data();
    // Ensure members field exists before trying to get keys
    const memberIds = bandData.members ? Object.keys(bandData.members) : [];

    // Fetch detailed member data (might show stale data if offline)
    const memberPromises = memberIds.map(async (id) => {
        try {
            // Cannot easily show spinner per member here, rely on cache
            const userSnap = await getDoc(doc(db, "users", id)); // User data should be cached
            const userData = userSnap.exists() ? userSnap.data() : null;
            // Use member data stored within the band document as primary source for role/name
            const bandMemberInfo = bandData.members[id];
            return {
                id,
                name: bandMemberInfo?.name || userData?.name || 'Unknown Member',
                photoURL: userData?.profileImageUrl || null, // Get photo from user doc
                role: bandMemberInfo?.role || 'member' // Role from band doc
            };
        } catch (error) {
            console.warn(`Could not fetch data for member ${id}:`, error);
            // Provide fallback using info from band doc if possible
            const bandMemberInfo = bandData.members[id];
            return {
                 id,
                 name: bandMemberInfo?.name || 'Member (Offline?)',
                 photoURL: null,
                 role: bandMemberInfo?.role || 'member'
            };
        }
    });

    const members = await Promise.all(memberPromises);
    // Convert array back to map for easier lookup if needed, or keep as array
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
    const inviteeName = userSnapshot.docs[0].data().name || inviteeEmail; // Get invitee name

    // Check if user is already a member
    const bandSnap = await getDoc(doc(db, "bands", bandId));
    if (bandSnap.exists() && bandSnap.data().members && bandSnap.data().members[inviteeId]) {
        throw new Error(`${inviteeName} is already a member of this band.`);
    }

    // TODO: Check if an invite already exists?

    const inviteRef = doc(collection(db, "invitations"));
    // Store band name and invitee name for easier display later if needed
    const bandName = bandSnap.exists() ? bandSnap.data().name : 'Unknown Band';
    return await setDoc(inviteRef, {
        bandId: bandId,
        bandName: bandName,
        inviteeId: inviteeId,
        inviteeName: inviteeName,
        status: 'pending',
        createdAt: serverTimestamp()
     });
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
    // Use FieldValue.delete() via deleteField to remove map keys
    batch.update(bandRef, { [`members.${memberId}`]: deleteField() });
    batch.update(userRef, { [`bands.${bandId}`]: deleteField() });
    return await batch.commit(); // Works offline
}


// --- USER DATA & PROFILE FUNCTIONS ---

/**
 * Fetches a user's data from the Firestore 'users' collection using graceful helper.
 * @param {string} userId - The unique ID of the user.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Object|null>} A promise that resolves with the user's data object or null if not found/error.
 */
export async function getUserData(userId, loadingContainer = null) {
  if (!userId) {
       console.error("getUserData called with null or undefined userId");
       if (loadingContainer) {
            const container = typeof loadingContainer === 'string' ? document.querySelector(loadingContainer) : loadingContainer;
            if (container) container.innerHTML = `<p class="p-5 text-center text-red-400">Error: Invalid user ID.</p>`;
       }
       return null; // Return null on invalid ID
  }
  const userDocRef = doc(db, "users", userId);
  // Use gracefulGet helper, passing the promise directly
  const userDocSnap = await gracefulGet(getDoc(userDocRef), loadingContainer, "Could not load user data while offline.");

  // gracefulGet returns null on handled error, check for that and existence
  if (userDocSnap && userDocSnap.exists()) {
    return { id: userDocSnap.id, ...userDocSnap.data() };
  } else {
    // If userDocSnap is null, gracefulGet handled the UI error.
    // If it exists but !exists(), the user doc wasn't found.
    if (userDocSnap && !userDocSnap.exists()) {
         console.warn("No user data found for ID:", userId);
         // Optionally show a "not found" message if a container was provided
          if (loadingContainer) {
             const container = typeof loadingContainer === 'string' ? document.querySelector(loadingContainer) : loadingContainer;
             if (container && !container.innerHTML.includes('Error')) { // Avoid overwriting other errors
                 container.innerHTML = `<p class="p-5 text-center text-neutral-500">User profile not found.</p>`;
             }
          }
    }
    return null; // Return null if not found or if gracefulGet failed
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
  // Add last updated timestamp?
  profileData.updatedAt = serverTimestamp();
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
   preferencesData.updatedAt = serverTimestamp();
  return await updateDoc(userDocRef, preferencesData); // Works offline
}


// --- GIG & APPLICATION FUNCTIONS ---

/**
 * Fetches all gigs from the 'gigs' collection using graceful helper.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of gig documents or null on error.
 */
export async function fetchGigs(loadingContainer = null) {
  const q = query(collection(db, "gigs"), orderBy("date", "desc")); // Order by date
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load gigs while offline.");
  if (!querySnapshot) return null; // Error handled by gracefulGet

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
 * Fetches a single gig's details.
 * @param {string} id - The ID of the gig.
 * @returns {Promise<import("firebase/firestore").DocumentSnapshot>} Firestore DocumentSnapshot
 */
export async function getGigDetails(id) {
    if (!id) throw new Error("Gig ID missing");
    const gigRef = doc(db, "gigs", id);
    // Returns the promise, expects gracefulGet in the caller
    return await getDoc(gigRef);
}


/**
 * Creates a new event in the 'calendarEvents' collection. Works offline.
 * @param {object} eventData - The data for the event { userId, title, type, date, time, notes }.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createCalendarEvent(eventData) {
  // Combine date and time, handle potential parsing issues
  let eventTimestamp;
  try {
      const dateTimeString = `${eventData.date}T${eventData.time}`;
      eventTimestamp = Timestamp.fromDate(new Date(dateTimeString));
  } catch (e) {
      console.error("Invalid date/time format:", eventData.date, eventData.time, e);
      throw new Error("Invalid date or time provided.");
  }

  const eventToSave = {
      userId: eventData.userId,
      title: eventData.title,
      type: eventData.type,
      date: eventTimestamp, // Use Firestore Timestamp
      notes: eventData.notes || '', // Ensure notes is at least an empty string
      createdAt: serverTimestamp()
  };
  return await addDoc(collection(db, "calendarEvents"), eventToSave); // Works offline
}

/**
 * Fetches all calendar events for a specific user using graceful helper.
 * @param {string} userId - The ID of the user whose events to fetch.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of event documents or null on error.
 */
export async function fetchCalendarEvents(userId, loadingContainer = null) {
  const eventsCollectionRef = collection(db, "calendarEvents");
  const q = query(eventsCollectionRef, where("userId", "==", userId), orderBy("date", "asc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load calendar while offline.");
  if (!querySnapshot) return null; // Error handled by gracefulGet

  const events = [];
  querySnapshot.forEach((doc) => {
    const eventData = doc.data();
    // Handle potential missing or invalid date
    const date = eventData.date?.toDate ? eventData.date.toDate() : null;
    if (date) { // Only include events with valid dates
        events.push({
          id: doc.id, ...eventData,
          // Store the Date object for easier sorting/filtering if needed later
          dateObject: date,
          formattedDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          formattedTime: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        });
    } else {
        console.warn(`Event ${doc.id} skipped due to invalid date.`);
    }
  });
  return events;
}

/**
 * Creates a new application document and updates user's appliedGigs map. Works offline.
 * @param {string} gigId - The ID of the gig being applied for.
 * @param {string} userId - The ID of the user applying.
 * @returns {Promise<void>}
 */
export async function applyForGig(gigId, userId) {
  if (!gigId || !userId) throw new Error("Gig ID and User ID are required to apply.");

  const applicationData = {
      gigId: gigId,
      userId: userId,
      status: 'applied',
      appliedAt: serverTimestamp()
  };

  const appRef = doc(collection(db, "applications")); // Auto-generate ID
  const userRef = doc(db, "users", userId);

  const batch = writeBatch(db);
  batch.set(appRef, applicationData);
  // Add gigId to user's appliedGigs map for quick lookup
  batch.update(userRef, {
      [`appliedGigs.${gigId}`]: true // Store simple boolean or timestamp if needed
      // TODO: Decrement applicationsLeft if using a counter?
  });

  return await batch.commit(); // Works offline
}


/**
 * Fetches all applications for a specific user using graceful helper.
 * @param {string} userId - The ID of the user whose applications to fetch.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of combined application and gig data or null on error.
 */
export async function fetchMyApplications(userId, loadingContainer = null) {
  const applicationsRef = collection(db, "applications");
  // Order by application time, newest first
  const q = query(applicationsRef, where("userId", "==", userId), orderBy("appliedAt", "desc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load applications while offline.");
  if (!querySnapshot) return null; // Error handled

  if (querySnapshot.empty) return [];

  const applicationPromises = querySnapshot.docs.map(async (appDoc) => {
    const applicationData = appDoc.data();
    try {
        const gigDocRef = doc(db, "gigs", applicationData.gigId);
        // Rely on cache for gig data; can't easily show spinner per application row
        const gigDocSnap = await getDoc(gigDocRef); // Uses cache
        if (gigDocSnap.exists()) {
            const gigData = gigDocSnap.data();
            const date = gigData.date?.toDate ? gigData.date.toDate().toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            }) : 'Date N/A';
            // Combine application data with relevant gig details
            return {
                ...applicationData,
                id: appDoc.id, // Application ID
                gigVenue: gigData.venueName,
                gigGenre: gigData.genre,
                gigDate: date,
                gigId: applicationData.gigId // Ensure gigId is present
             };
        } else {
             console.warn(`Gig ${applicationData.gigId} not found for application ${appDoc.id}`);
             // Return application data even if gig is missing (e.g., deleted)
             return { ...applicationData, id: appDoc.id, gigVenue: 'Gig Not Found', gigGenre: '', gigDate: '' };
        }
    } catch (error) {
        console.warn(`Could not fetch gig details for application ${appDoc.id}:`, error);
        // Return partial data if gig fetch fails (e.g., offline no cache)
         return { ...applicationData, id: appDoc.id, gigVenue: 'Gig Details Unavailable', gigGenre: '', gigDate: '' };
    }
  });

  const applications = await Promise.all(applicationPromises);
  // Filter out potential nulls if map function returned null explicitly (though currently it returns partial data)
  return applications.filter(app => app !== null);
}


/**
 * Fetches all applicants for a specific gig using graceful helper.
 * @param {string} gigId - The ID of the gig to fetch applicants for.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of applicant user data or null on error.
 */
export async function fetchApplicantsForGig(gigId, loadingContainer = null) {
  if (!gigId) throw new Error("Gig ID is required to fetch applicants.");

  const applicationsRef = collection(db, "applications");
  const q = query(applicationsRef, where("gigId", "==", gigId), orderBy("appliedAt", "asc")); // Oldest first?
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load applicants while offline.");
  if (!querySnapshot) return null; // Error handled

  if (querySnapshot.empty) return [];

  const applicantPromises = querySnapshot.docs.map(async (appDoc) => {
    const applicantId = appDoc.data().userId;
    try {
        // Use getUserData which relies on cache if offline
        const userData = await getUserData(applicantId, null); // Pass null for container
        // Return user data if found, otherwise null/fallback
        return userData ? { ...userData, id: applicantId } : null; // Ensure ID is included
    } catch (error) {
        // getUserData handles its own errors/logging
        console.warn(`Could not fetch data for applicant ${applicantId} (likely already logged by getUserData):`, error);
        // Provide minimal fallback if needed, though getUserData might return null anyway
        return { id: applicantId, name: 'Applicant Data Unavailable' };
    }
  });

  const applicants = await Promise.all(applicantPromises);
  // Filter out nulls where user data couldn't be fetched at all
  return applicants.filter(applicant => applicant !== null);
}


/**
 * Fetches all gigs for a specific owner using graceful helper.
 * @param {string} userId - The ID of the user whose gigs to fetch.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of gig documents or null on error.
 */
export async function fetchGigsForOwner(userId, loadingContainer = null) {
  if (!userId) throw new Error("User ID is required.");

  const gigsRef = collection(db, "gigs");
  const q = query(gigsRef, where("ownerId", "==", userId), orderBy("date", "desc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load your gigs while offline.");
  if (!querySnapshot) return null; // Error handled

  const gigs = [];

  // Use Promise.all for potentially faster applicant count fetching (if online)
  const gigProcessingPromises = querySnapshot.docs.map(async (docSnap) => {
      const gigData = docSnap.data();
      let applicantCount = 0;
      try {
          // Fetch applicant count - might be stale if offline
          const appsRef = collection(db, "applications");
          const appsQuery = query(appsRef, where("gigId", "==", docSnap.id));
          // Note: Using getDocs here will hit cache if offline.
          const appsSnapshot = await getDocs(appsQuery); // Uses cache
          applicantCount = appsSnapshot.size;
      } catch (error) {
          console.warn(`Could not get applicant count for gig ${docSnap.id}:`, error);
          // Keep applicantCount = 0 if fetch fails
      }

      const date = gigData.date?.toDate ? gigData.date.toDate() : null; // Store Date object
      const formattedDate = date ? date.toLocaleDateString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric'
      }) : 'Date N/A';

      return {
           id: docSnap.id,
           ...gigData,
           date: gigData.date, // Keep original Timestamp or whatever it is
           dateObject: date, // Add parsed Date object
           applicantCount: applicantCount,
           formattedDate: formattedDate
       };
  });

  return await Promise.all(gigProcessingPromises);
}


/**
 * Creates a new gig document. Works offline.
 * @param {object} gigData - The data for the new gig { ownerId, eventName, location, date, payout, description, genre }.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createGig(gigData) {
  if (!gigData.ownerId) throw new Error("An ownerId must be provided.");

  // Convert date string to Firestore Timestamp
  let eventTimestamp;
  try {
      // Assuming gigData.date is 'YYYY-MM-DD'
      eventTimestamp = Timestamp.fromDate(new Date(gigData.date + 'T12:00:00')); // Add default time if only date is provided
  } catch(e) {
       console.error("Invalid date format:", gigData.date, e);
       throw new Error("Invalid date provided.");
  }

  const gigToSave = {
      ownerId: gigData.ownerId,
      venueName: gigData.eventName, // Align field name with usage
      location: gigData.location,
      date: eventTimestamp,
      payout: Number(gigData.payout), // Ensure payout is a number
      description: gigData.description || '',
      genre: gigData.genre || '',
      status: 'open', // Initial status
      createdAt: serverTimestamp()
  };
  return await addDoc(collection(db, "gigs"), gigToSave); // Works offline
}


// --- GEAR LISTING FUNCTIONS ---

/**
 * Creates a new gear listing. Works offline.
 * @param {object} itemData - The data for the item being listed { sellerId, name, category, price, description, location, imageUrl? }.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createGearListing(itemData) {
  if (!itemData.sellerId) throw new Error("A sellerId must be provided.");
  const itemToSave = {
       ...itemData,
       price: Number(itemData.price), // Ensure price is number
       createdAt: serverTimestamp()
   };
  return await addDoc(collection(db, "gear_listings"), itemToSave); // Works offline
}

/**
 * Fetches all gear listings using graceful helper.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of gear listing documents or null on error.
 */
export async function fetchGearListings(loadingContainer = null) {
  const listingsRef = collection(db, "gear_listings");
  const q = query(listingsRef, orderBy("createdAt", "desc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load gear while offline.");
  if (!querySnapshot) return null; // Error handled

  const listings = [];
  querySnapshot.forEach((doc) => { listings.push({ id: doc.id, ...doc.data() }); });
  return listings;
}

/**
 * Fetches a single gear listing using graceful helper, including seller info.
 * @param {string} listingId - The ID of the gear listing to fetch.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Object|null>} Listing data with seller info or null.
 */
export async function getGearListing(listingId, loadingContainer = null) {
    if (!listingId) return null;
    const listingRef = doc(db, "gear_listings", listingId);
    // Fetch the main listing data
    const listingSnap = await gracefulGet(getDoc(listingRef), loadingContainer, "Could not load item details offline.");

    if (!listingSnap || !listingSnap.exists()) {
        // gracefulGet handled UI error message if container provided
        return null;
    }

    const listingData = listingSnap.data();
    let sellerName = "Unknown Seller";
    let sellerProfileImageUrl = null;

    try {
        // Fetch seller data concurrently, relying on cache if offline
        // Use getUserData which uses gracefulGet internally but without a loading container here
        const sellerData = await getUserData(listingData.sellerId, null); // Pass null for container
        if (sellerData) {
            sellerName = sellerData.name || 'Seller Name Unavailable';
            sellerProfileImageUrl = sellerData.profileImageUrl;
        } else {
             sellerName = "Seller (Data Unavailable)"; // Indicate data fetch issue
        }
    } catch (error) {
        // This catch might not be needed if getUserData handles its errors gracefully and returns null
        console.warn(`Could not fetch seller details for listing ${listingId}:`, error);
        sellerName = "Seller (Error)";
    }

    return { id: listingSnap.id, ...listingData, sellerName, sellerProfileImageUrl };
}


// --- PLAYER POST FUNCTIONS ---

/**
 * Creates a new player post. Works offline.
 * @param {object} postData - The data for the post { userId, type, instrument, ... }.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createPlayerPost(postData) {
  if (!postData.userId) throw new Error("A userId must be provided.");
  // Add server timestamp for creation time
  const postToSave = { ...postData, createdAt: serverTimestamp() };
  return await addDoc(collection(db, "player_posts"), postToSave); // Works offline
}

/**
 * Fetches all player posts using graceful helper, including user info.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of post documents with user info or null on error.
 */
export async function fetchPlayerPosts(loadingContainer = null) {
  const postsRef = collection(db, "player_posts");
  const q = query(postsRef, orderBy("createdAt", "desc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load posts while offline.");
  if (!querySnapshot) return null; // Error handled

  // Fetch user details for each post concurrently
  const postProcessingPromises = querySnapshot.docs.map(async (postDoc) => {
      const postData = postDoc.data();
      let userName = 'Unknown User';
      let userProfileImage = null;
      try {
          // Fetch user data, rely on cache if offline
          const userData = await getUserData(postData.userId, null); // No container here
          if(userData) {
               userName = userData.name || 'Name Unavailable';
               userProfileImage = userData.profileImageUrl;
          } else {
               userName = 'User (Data Unavailable)';
          }
      } catch(error) {
          // getUserData handles its errors, this catch might not be needed
          console.warn(`Could not fetch user details for post ${postDoc.id}:`, error);
          userName = 'User (Error)';
      }
      return { id: postDoc.id, ...postData, userName, userProfileImage };
  });

  return await Promise.all(postProcessingPromises);
}


// --- BOOKING & REVIEW FUNCTIONS ---

/**
 * Confirms a booking by updating the gig status and storing booked artist info. Works offline.
 * @param {string} gigId - The ID of the gig to confirm.
 * @param {string} artistId - The ID of the artist being booked.
 * @param {string} artistName - The name of the artist being booked.
 * @returns {Promise<void>}
 */
export async function confirmBooking(gigId, artistId, artistName) {
  if (!gigId || !artistId || !artistName) throw new Error("Required info missing for booking.");
  const gigDocRef = doc(db, "gigs", gigId);
  // Add bookedAt timestamp?
  return await updateDoc(gigDocRef, {
      status: 'booked',
      bookedArtistId: artistId,
      bookedArtistName: artistName,
      bookedAt: serverTimestamp()
  }); // Works offline
}

/**
 * Creates a new review. Works offline.
 * @param {object} reviewData - The data for the review { reviewerId, subjectId, gigId, rating, comment, type }.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createReview(reviewData) {
  if (!reviewData.reviewerId || !reviewData.subjectId || !reviewData.gigId || !reviewData.type) {
        throw new Error("Required info missing for review (reviewer, subject, gig, type).");
  }
  // Ensure rating is a number
  reviewData.rating = Number(reviewData.rating);
  const reviewToSave = { ...reviewData, createdAt: serverTimestamp() };
  return await addDoc(collection(db, "reviews"), reviewToSave); // Works offline
}


// --- JAM SESSION FUNCTIONS ---

/**
 * Creates a new jam session. Works offline.
 * @param {object} sessionData - The data for the jam session { hostId, title, location, date, time, description }.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function createJamSession(sessionData) {
  if (!sessionData.hostId) throw new Error("A hostId must be provided.");
  // Combine date and time, handle potential parsing issues
  let sessionTimestamp;
   try {
       const dateTimeString = `${sessionData.date}T${sessionData.time}`;
       sessionTimestamp = Timestamp.fromDate(new Date(dateTimeString));
   } catch (e) {
       console.error("Invalid date/time format for jam session:", sessionData.date, sessionData.time, e);
       throw new Error("Invalid date or time provided for jam session.");
   }

  const sessionToSave = {
      hostId: sessionData.hostId,
      title: sessionData.title,
      location: sessionData.location,
      dateTime: sessionTimestamp, // Use Firestore Timestamp
      description: sessionData.description || '',
      createdAt: serverTimestamp()
   };
  return await addDoc(collection(db, "jam_sessions"), sessionToSave); // Works offline
}

/**
 * Fetches all jam sessions using graceful helper, including host info.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of jam session documents with host info or null on error.
 */
export async function fetchJamSessions(loadingContainer = null) {
  const sessionsRef = collection(db, "jam_sessions");
  // Order by session date, ascending
  const q = query(sessionsRef, orderBy("dateTime", "asc"));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load sessions while offline.");
  if (!querySnapshot) return null; // Error handled

  // Fetch host details concurrently
  const sessionProcessingPromises = querySnapshot.docs.map(async (sessionDoc) => {
      const sessionData = sessionDoc.data();
      let hostName = 'Unknown Host';
      let hostProfileImage = null;
      try {
          // Fetch host data, rely on cache if offline
          const hostData = await getUserData(sessionData.hostId, null); // No container here
          if (hostData) {
               hostName = hostData.name || 'Name Unavailable';
               hostProfileImage = hostData.profileImageUrl;
          } else {
               hostName = 'Host (Data Unavailable)';
          }
      } catch(error) {
           // getUserData handles its errors
           console.warn(`Could not fetch host details for session ${sessionDoc.id}:`, error);
           hostName = 'Host (Error)';
      }
      // Handle potential invalid date
      const date = sessionData.dateTime?.toDate ? sessionData.dateTime.toDate() : null;

      if (date) { // Only include sessions with valid dates
          return {
            id: sessionDoc.id, ...sessionData, hostName, hostProfileImage,
            dateObject: date, // Include Date object
            formattedDate: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), // Changed format slightly
            formattedTime: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          };
      } else {
          console.warn(`Jam session ${sessionDoc.id} skipped due to invalid date.`);
          return null; // Exclude invalid sessions
      }
  });

  const sessions = await Promise.all(sessionProcessingPromises);
  // Filter out nulls from invalid dates or other processing errors
  return sessions.filter(session => session !== null);
}


// --- MESSAGING FUNCTIONS ---
// Note: Real-time listeners (onSnapshot) behave differently offline. They will
// initially receive cached data and then update when the connection returns.
// Sending messages works offline and syncs later.

/**
 * Creates or retrieves a conversation document. Works offline for retrieval if cached, create works offline.
 * @param {string} userId1 - The ID of the current user.
 *@param {string} userId2 - The ID of the other user.
 * @returns {Promise<string>} The ID of the conversation.
 */
export async function createOrGetConversation(userId1, userId2) {
  // Ensure consistent ordering for the ID
  const conversationId = [userId1, userId2].sort().join('_');
  const conversationRef = doc(db, "conversations", conversationId);
  // Get (will use cache if offline)
  const conversationSnap = await getDoc(conversationRef); // Use cache
  if (!conversationSnap.exists()) {
    // Set will work offline - include participant names/images for easier listing later?
    // Fetch user data (relies on cache if offline)
    let user1Name = 'User 1';
    let user2Name = 'User 2';
    try {
        const [user1Data, user2Data] = await Promise.all([
             getUserData(userId1, null),
             getUserData(userId2, null)
        ]);
        user1Name = user1Data?.name || userId1;
        user2Name = user2Data?.name || userId2;
    } catch (e) { console.warn("Could not fetch user names for conversation creation:", e); }

    await setDoc(conversationRef, {
        participants: [userId1, userId2],
        participantInfo: { // Store basic info for listing
            [userId1]: { name: user1Name },
            [userId2]: { name: user2Name }
        },
        createdAt: serverTimestamp()
     });
  }
  return conversationId;
}

/**
 * Sends a message and updates the conversation's last message. Works offline.
 * @param {string} conversationId - The ID of the conversation.
 * @param {object} messageData - The message object { text, senderId }.
 * @returns {Promise<void>}
 */
export async function sendMessage(conversationId, messageData) {
  const messagesRef = collection(db, "conversations", conversationId, "messages");
  const conversationRef = doc(db, "conversations", conversationId);

  // Reference for the new message document
  const newMessageRef = doc(messagesRef); // Auto-generate ID

  const batch = writeBatch(db);

  // Set the new message content
  batch.set(newMessageRef, {
      ...messageData,
      timestamp: serverTimestamp() // Use server timestamp for ordering
  });

  // Update the conversation's last message and timestamp
  batch.update(conversationRef, {
      lastMessage: {
          text: messageData.text,
          senderId: messageData.senderId,
          timestamp: serverTimestamp()
       }
   });

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
  // Limit the initial load and subsequent updates? e.g., limit(50)
  const q = query(messagesRef, orderBy("timestamp", "asc")); // Get messages in chronological order
  return onSnapshot(q, (querySnapshot) => {
    const messages = [];
    querySnapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    // Check for metadata changes to detect offline/online transitions if needed
    const source = querySnapshot.metadata.fromCache ? "local cache" : "server";
    console.log("Messages data came from:", source);
    callback(messages);
  }, errorCallback); // Pass error callback
}

/**
 * Fetches all conversations using graceful helper, including participant info.
 * @param {string} userId - The ID of the current user.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of conversation objects or null on error.
 */
export async function getConversations(userId, loadingContainer = null) {
  const convosRef = collection(db, "conversations");
  // Query for conversations where the user is a participant
  const q = query(convosRef, where("participants", "array-contains", userId));
  // Fetch the conversation list
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load messages while offline.");
  if (!querySnapshot) return null; // Error handled

  const conversationPromises = querySnapshot.docs.map(async (convoDoc) => {
    const convoData = convoDoc.data();
    // Find the ID of the *other* participant
    const otherParticipantId = convoData.participants.find(id => id !== userId);
    if (!otherParticipantId) return null; // Should not happen in a 2-person chat

    let otherUserName = 'Unknown User';
    let otherUserImage = null;
    try {
        // Fetch the other user's data, relying on cache if offline
        // Use the info stored in conversation doc first as fallback
        otherUserName = convoData.participantInfo?.[otherParticipantId]?.name || 'Unknown User';
        const otherUserData = await getUserData(otherParticipantId, null); // No container
        if(otherUserData){
             otherUserName = otherUserData.name || otherUserName; // Prefer fresh name
             otherUserImage = otherUserData.profileImageUrl;
        }
    } catch (error) {
         // getUserData handles its errors
         console.warn(`Could not fetch other user data for convo ${convoDoc.id}:`, error);
         otherUserName = otherUserName === 'Unknown User' ? 'User (Error)' : otherUserName; // Keep cached name if fetch fails
    }

    // Use lastMessage field, fallback to createdAt if no messages yet
    let lastMessage = convoData.lastMessage || { text: 'No messages yet...', timestamp: convoData.createdAt };

    return {
        id: convoDoc.id,
        ...convoData,
        otherUserName,
        otherUserImage,
        otherUserId: otherParticipantId,
        lastMessage
     };
  });

  const conversations = (await Promise.all(conversationPromises)).filter(c => c !== null);
  // Sort by last message timestamp, descending (newest first)
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
    // Add bandId index in Firestore rules if querying by it
    return await setDoc(requestRef, {
        bandId: bandId,
        userId: userId,
        status: 'pending',
        createdAt: serverTimestamp()
     }); // Works offline
}

/**
 * Fetches pending join requests using graceful helper, including user name.
 * @param {string} bandId - The ID of the band.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of request objects or null on error.
 */
export async function getJoinRequests(bandId, loadingContainer = null) {
    const requestsRef = collection(db, "join_requests");
    const q = query(requestsRef, where("bandId", "==", bandId), where("status", "==", "pending"), orderBy("createdAt", "asc"));
    const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load join requests offline.");
    if (!querySnapshot) return null; // Error handled

    // Fetch user names concurrently
    const requestProcessingPromises = querySnapshot.docs.map(async (docSnap) => {
        const requestData = docSnap.data();
        let userName = 'User (Offline?)';
        try {
            // Fetch user data, rely on cache if offline
            const userData = await getUserData(requestData.userId, null); // No container
            if (userData) userName = userData.name || 'Name Unavailable';
            else userName = 'User (Data Unavailable)';
        } catch (error) {
            // getUserData handles errors
            console.warn(`Could not fetch user data for join request ${docSnap.id}:`, error);
            userName = 'User (Error)';
        }
        return { id: docSnap.id, ...requestData, userName };
    });

    return await Promise.all(requestProcessingPromises);
}

/**
 * Approves a join request, adding user to band and updating user doc. Works offline.
 * @param {string} requestId - The ID of the join request to approve.
 * @returns {Promise<void>}
 */
export async function approveJoinRequest(requestId) {
    const requestRef = doc(db, "join_requests", requestId);
    // Get request data (uses cache if offline)
    const requestSnap = await getDoc(requestRef); // Uses cache
    if (!requestSnap.exists()) throw new Error("Request not found or already processed.");
    if (requestSnap.data().status !== 'pending') throw new Error("Request is not pending.");

    const { bandId, userId } = requestSnap.data();
    // Get user data (uses cache if offline) needed for band member info
    const userSnap = await getDoc(doc(db, "users", userId)); // Uses cache
    const userName = userSnap.exists() ? userSnap.data().name || userId : userId; // Fallback name

    const bandRef = doc(db, "bands", bandId);
    const userRef = doc(db, "users", userId);
    const batch = writeBatch(db);

    // Add user to band members map
    batch.update(bandRef, {
        [`members.${userId}`]: {
             name: userName,
             role: 'member', // Default role
             joinedAt: serverTimestamp()
        }
    });
    // Add band ID to user's bands map
    batch.update(userRef, { [`bands.${bandId}`]: 'member' });
    // Update request status
    batch.update(requestRef, { status: 'approved', processedAt: serverTimestamp() });

    return await batch.commit(); // Works offline
}


// --- PLAYER DISCOVERY FUNCTIONS ---

/**
 * Fetches available players (users with isLookingForBands == true) using graceful helper.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of user objects or null on error.
 */
export async function getAvailablePlayers(loadingContainer = null) {
  const usersRef = collection(db, "users");
  // Add index for isLookingForBands in Firestore
  const q = query(usersRef, where("isLookingForBands", "==", true));
  const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load players offline.");
  if (!querySnapshot) return null; // Error handled

  const players = [];
  querySnapshot.forEach((doc) => { players.push({ id: doc.id, ...doc.data() }); });
  return players;
}

/**
 * Fetches all players (users) using graceful helper. Consider pagination for large user bases.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of user objects or null on error.
 */
export async function getAllPlayers(loadingContainer = null) {
  // WARNING: Fetching ALL users can be inefficient. Add limits/pagination if needed.
  const usersRef = collection(db, "users");
  // Add ordering? e.g., orderBy("name") - requires index
  const querySnapshot = await gracefulGet(getDocs(usersRef), loadingContainer, "Could not load players offline.");
  if (!querySnapshot) return null; // Error handled

  const players = [];
  querySnapshot.forEach((doc) => { players.push({ id: doc.id, ...doc.data() }); });
  return players;
}

/**
 * Fetches all bands using graceful helper. Consider pagination.
 * @param {HTMLElement|string|null} [loadingContainer] - Optional element for loading state.
 * @returns {Promise<Array|null>} A promise that resolves to an array of band objects or null on error.
 */
export async function getAllBands(loadingContainer = null) {
    // WARNING: Fetching ALL bands can be inefficient. Add limits/pagination if needed.
    const bandsRef = collection(db, "bands");
    const q = query(bandsRef, orderBy("name")); // Requires index
    const querySnapshot = await gracefulGet(getDocs(q), loadingContainer, "Could not load bands offline.");
    if (!querySnapshot) return null; // Error handled

    const bands = [];
    querySnapshot.forEach((doc) => { bands.push({ id: doc.id, ...doc.data() }); });
    return bands;
}

/**
 * Creates a report document. Works offline.
 * @param {string} reportedItemId - ID of the item being reported.
 * @param {string} reportedItemType - Type of item ('user', 'gig', 'gear_listing', 'player_post', 'jam_session').
 * @param {string} reporterId - User ID of the reporter.
 * @param {string} [reason='N/A'] - Optional reason provided by the reporter.
 * @returns {Promise<import("firebase/firestore").DocumentReference>}
 */
export async function reportContent(reportedItemId, reportedItemType, reporterId, reason = 'N/A') {
  if (!reportedItemId || !reportedItemType || !reporterId) throw new Error("Missing required fields for report.");
  const reportData = {
      reportedItemId,
      reportedItemType,
      reporterId,
      reason,
      status: 'pending', // Initial status
      createdAt: serverTimestamp()
  };
  return await addDoc(collection(db, "reports"), reportData); // Works offline
}