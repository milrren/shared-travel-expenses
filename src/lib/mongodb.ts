import { MongoClient, Db } from "mongodb";

const dbName = process.env.MONGODB_DB ?? "shared_travel_expenses";

// In development, cache the client connection across hot-reloads.
// In production each function invocation reuses the module-level cache.
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let _prodClientPromise: Promise<MongoClient> | undefined;

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Please define the MONGODB_URI environment variable in .env.local"
    );
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(uri).connect();
    }
    return global._mongoClientPromise;
  }

  if (!_prodClientPromise) {
    _prodClientPromise = new MongoClient(uri).connect();
  }
  return _prodClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName);
}


