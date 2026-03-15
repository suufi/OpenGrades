import mongoose from 'mongoose'
import Karma from '@/models/Karma'

/**
 * Add a karma transaction (earn or spend). Creates a Karma doc; does not cache total on User.
 */
export async function addKarma(
  actorId: mongoose.Types.ObjectId | string,
  amount: number,
  description: string
): Promise<void> {
  const id = typeof actorId === 'string' ? new mongoose.Types.ObjectId(actorId) : actorId
  await Karma.create({
    actor: id,
    amount,
    description,
  })
}

/**
 * Get current karma balance for a user (sum of all Karma.amount for that actor).
 */
export async function getKarmaBalance(userId: mongoose.Types.ObjectId | string): Promise<number> {
  const id = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId
  const result = await Karma.aggregate([
    { $match: { actor: id } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ])
  return result[0]?.total ?? 0
}
