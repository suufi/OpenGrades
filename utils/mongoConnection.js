import mongoose from 'mongoose'

const MONGODB_CONNECTION_URI = process.env.MONGODB_CONNECTION_URI

if (!MONGODB_CONNECTION_URI) {
  throw new Error(
    'MONGODB_CONNECTION_URI environment is not set inside .env'
  )
}

let cached = global.mongoose

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

async function mongoConnection () {
  if (cached.conn) {
    return cached.conn
  }

  if (!cached.promise) {
    const opts = {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }

    cached.promise = mongoose.connect(MONGODB_CONNECTION_URI, opts).then(mongoose => {
      return mongoose
    })
  }
  cached.conn = await cached.promise
  return cached.conn
}

export default mongoConnection
