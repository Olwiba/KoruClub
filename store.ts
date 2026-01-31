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
    const possiblePaths = [
      `${options.session}.zip`,
      `./.wwebjs_auth/${options.session}.zip`,
      `.wwebjs_auth/${options.session}.zip`,
    ];

    let filePath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    try {
      if (filePath) {
        const data = fs.readFileSync(filePath);
        await db.whatsappSession.upsert({
          where: { sessionId: options.session },
          update: { data },
          create: { sessionId: options.session, data },
        });
        const sizeMB = (data.length / 1024 / 1024).toFixed(2);
        console.log(`[RemoteAuth] Session saved to database (${sizeMB}MB)`);
      } else {
        console.warn(`Session zip file not found. Checked: ${possiblePaths.join(", ")}`);
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
        const pathDir = options.path.substring(0, options.path.lastIndexOf("/"));
        if (pathDir && !fs.existsSync(pathDir)) {
          fs.mkdirSync(pathDir, { recursive: true });
        }
        fs.writeFileSync(options.path, data);
        const sizeMB = (data.length / 1024 / 1024).toFixed(2);
        console.log(`[RemoteAuth] Session restored from database (${sizeMB}MB)`);
      } else {
        console.warn(`Session not found in database: ${options.session}`);
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
