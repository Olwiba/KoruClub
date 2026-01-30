import fs from "fs";
import { db } from "./db";

/**
 * Prisma Store for WhatsApp Web RemoteAuth
 * Implements the Store interface required by RemoteAuth strategy
 */
export class PrismaStore {
  constructor() {
    console.log("[DEBUG] PrismaStore constructor called");
  }

  async sessionExists(options: { session: string }): Promise<boolean> {
    console.log(`[DEBUG] sessionExists called for: ${options.session}`);
    try {
      const count = await db.whatsappSession.count({
        where: { sessionId: options.session },
      });
      console.log(`[DEBUG] sessionExists result: ${count > 0} (count: ${count})`);
      return count > 0;
    } catch (error) {
      console.error("Failed to check if session exists:", error);
      return false;
    }
  }

  async save(options: { session: string }): Promise<void> {
    console.log(`[DEBUG] save called for: ${options.session}`);
    // RemoteAuth may put the zip in different locations
    const possiblePaths = [
      `${options.session}.zip`,
      `./.wwebjs_auth/${options.session}.zip`,
      `.wwebjs_auth/${options.session}.zip`,
    ];

    let filePath: string | null = null;
    for (const p of possiblePaths) {
      console.log(`[DEBUG] Checking for zip at: ${p} - exists: ${fs.existsSync(p)}`);
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    try {
      if (filePath) {
        const data = fs.readFileSync(filePath);
        console.log(`[DEBUG] Read zip file, size: ${data.length} bytes`);
        await db.whatsappSession.upsert({
          where: { sessionId: options.session },
          update: { data },
          create: { sessionId: options.session, data },
        });
        console.log(`WhatsApp session saved to database: ${options.session} (from ${filePath})`);
      } else {
        console.warn(`Session zip file not found. Checked: ${possiblePaths.join(", ")}`);
      }
    } catch (error) {
      console.error("Failed to save session to database:", error);
      throw error;
    }
  }

  async extract(options: { session: string; path: string }): Promise<void> {
    console.log(`[DEBUG] extract called for: ${options.session}, path: ${options.path}`);
    try {
      const session = await db.whatsappSession.findUnique({
        where: { sessionId: options.session },
      });
      console.log(`[DEBUG] extract DB query returned: ${session ? "found" : "not found"}`);

      if (session && session.data) {
        const data = session.data as Buffer;
        console.log(`[DEBUG] extract data size: ${data.length} bytes`);
        // Ensure directory exists before writing
        const pathDir = options.path.substring(0, options.path.lastIndexOf("/"));
        if (pathDir && !fs.existsSync(pathDir)) {
          console.log(`[DEBUG] Creating directory: ${pathDir}`);
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
