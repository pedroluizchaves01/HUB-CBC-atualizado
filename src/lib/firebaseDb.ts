import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  writeBatch,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { app, auth } from './firebaseAuth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firestore with the custom database ID provided in the configuration
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Saves or updates a document in a specific collection in Firestore.
 */
export const saveDoc = async (collectionName: string, id: string, data: any) => {
  try {
    const docRef = doc(db, collectionName, id);
    // Sanitize data: replace undefined fields with null or remove them to avoid Firestore errors
    const sanitizedData = JSON.parse(JSON.stringify(data, (key, value) => {
      return value === undefined ? null : value;
    }));
    await setDoc(docRef, sanitizedData, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${id}`);
  }
};

/**
 * Deletes a document from a specific collection in Firestore.
 */
export const removeDoc = async (collectionName: string, id: string) => {
  try {
    const docRef = doc(db, collectionName, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
  }
};

/**
 * Subscribes to a collection in real-time. 
 * If the collection is empty in Firestore, it automatically seeds it using the local storage cached data 
 * (if available) or the provided initial default data.
 */
export const subscribeCollection = (
  collectionName: string, 
  onUpdate: (data: any[]) => void, 
  defaultData: any[],
  localStorageKey?: string
) => {
  const colRef = collection(db, collectionName);

  // Setup the real-time listener
  const unsubscribe = onSnapshot(colRef, async (snapshot) => {
    if (snapshot.empty) {
      // 1. If snapshot is from cache and empty, wait for server to resolve actual database state
      if (snapshot.metadata.fromCache) {
        console.log(`Collection ${collectionName} is empty in cache, waiting for server...`);
        return;
      }

      console.log(`Collection ${collectionName} is empty on server. Checking global initialization...`);
      
      try {
        const initDocRef = doc(db, 'system_status', 'init');
        const initDoc = await getDoc(initDocRef);

        // 2. If system is already initialized globally, keep the collection empty (user deleted its contents)
        if (initDoc.exists() && initDoc.data()?.seeded) {
          console.log(`System already initialized. Keeping ${collectionName} empty.`);
          onUpdate([]);
          if (localStorageKey) {
            localStorage.setItem(localStorageKey, JSON.stringify([]));
          }
          return;
        }

        // 3. First time app is run: seed the database collection
        console.log(`System not initialized. Seeding collection ${collectionName}...`);
        let seedData = defaultData;
        if (localStorageKey) {
          const saved = localStorage.getItem(localStorageKey);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) {
                seedData = parsed;
                console.log(`Found existing data in localStorage for ${localStorageKey}. Seeding to Firestore...`);
              }
            } catch (e) {
              console.error(`Error parsing localStorage key ${localStorageKey}:`, e);
            }
          }
        }

        // Perform batch seeding to Firestore atomically, including marking the system as initialized
        const batch = writeBatch(db);
        seedData.forEach((item) => {
          const itemId = item.id || `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const docRef = doc(db, collectionName, itemId);
          const sanitized = JSON.parse(JSON.stringify(item, (key, value) => {
            return value === undefined ? null : value;
          }));
          batch.set(docRef, { ...sanitized, id: itemId });
        });

        // Atomically set initialization state
        batch.set(initDocRef, { seeded: true });
        await batch.commit();
        
        console.log(`Successfully seeded ${seedData.length} items to ${collectionName} and marked initialized.`);
      } catch (err) {
        console.error(`Failed to seed collection ${collectionName}:`, err);
        // Fallback to local representation if database seeding fails
        onUpdate(defaultData);
      }
    } else {
      // Collect the documents from the snapshot
      const items: any[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      
      // Pass the synchronized items to the React component state callback
      onUpdate(items);
      
      // Keep local device cache perfectly synchronized with the latest Firestore server state
      if (localStorageKey) {
        localStorage.setItem(localStorageKey, JSON.stringify(items));
      }
    }
  }, (error) => {
    console.error(`Error in onSnapshot listener for ${collectionName}:`, error);
    // If listener fails, fallback to freshest local device cache or defaultData
    let fallback = defaultData;
    if (localStorageKey) {
      const saved = localStorage.getItem(localStorageKey);
      if (saved) {
        try {
          fallback = JSON.parse(saved);
        } catch (_) {}
      }
    }
    onUpdate(fallback);
  });

  return unsubscribe;
};
