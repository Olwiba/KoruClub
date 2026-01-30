import fs from "fs";
import { db } from "./db";

/**
 * Prisma Store for WhatsApp Web RemoteAuth
 * Implements the Store interface required by RemoteAuth strategy
 */
export class PrismaStore {
  async sessionExists(options: { session: string }): Promise<boolean> {
    try {
      const count = await db.whatsappSession.count({
        where: { sessionId: options.session },
      });
      return count > 0;
    } catch (error) {
      console.error("Failed to check if session exists:", error);
      return false;
    }
  }

  async save(options: { session: string }): Promise<void> {
    const filePath = `${options.session}.zip`;
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);
        await db.whatsappSession.upsert({
          where: { sessionId: options.session },
          update: { data },
          create: { sessionId: options.session, data },
        });
        console.log(`WhatsApp session saved to database: ${options.session}`);
      } else {
        console.warn(`Session zip file not found: ${filePath}`);
      }
    } catch (error) {
      console.error("Failed to save session to database:", error);
      throw error;
    }
  }

  async extract(options: { session: string; path: string }): Promise<void> {
    try {
      const session = await db.whatsappSession.findUnique({
        where: { sessionId: options.session },
      });

      if (session && session.data) {
        const data = session.data as Buffer;
        // Ensure directory exists before writing
        const pathDir = options.path.substring(0, options.path.lastIndexOf("/"));
        if (pathDir && !fs.existsSync(pathDir)) {
          fs.mkdirSync(pathDir, { recursive: true });
        }
        fs.writeFileSync(options.path, data);
        console.log(`Extracted WhatsApp session from database: ${options.session}`);
      } else {
        console.warn(`Session data not found in database: ${options.session}`);
      }
    } catch (error) {
      console.error("Failed to extract session from database:", error);
      throw error;
    }
  }

  async delete(options: { session: string }): Promise<void> {
    try {
      await db.whatsappSession.delete({
        where: { sessionId: options.session },
      });
      console.log(`Deleted WhatsApp session from database: ${options.session}`);
    } catch (error) {
      // Ignore if not found
      console.debug("Could not delete session (may not exist):", error);
    }
  }
}
