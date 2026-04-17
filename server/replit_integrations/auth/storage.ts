import { users } from "@shared/schema";
import { db } from "../../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
export interface IAuthStorage {
  getUser(id: string): Promise<any | undefined>;
  upsertUser(userData: any): Promise<any>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<any | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    profileImageUrl?: string | null;
  }): Promise<any> {
    const existingUser = await this.getUser(userData.id);
    
    if (existingUser) {
      // Update existing user with OAuth data
      const [user] = await db
        .update(users)
        .set({
          name: userData.firstName && userData.lastName 
            ? `${userData.firstName} ${userData.lastName}`.trim()
            : existingUser.name,
        })
        .where(eq(users.id, userData.id))
        .returning();
      return user;
    }

    // Create new user from OAuth
    const name = userData.firstName && userData.lastName 
      ? `${userData.firstName} ${userData.lastName}`.trim()
      : userData.firstName || userData.email?.split('@')[0] || 'User';
    
    const [user] = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email || `${userData.id}@oauth.gridmart.ca`,
        password: '', // OAuth users don't have passwords
        name,
        type: 'buyer',
        roles: ['buyer'],
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
