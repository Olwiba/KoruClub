#!/usr/bin/env node
/**
 * Patches whatsapp-web.js to handle missing WhatsApp Web modules
 * This is a temporary fix for when WhatsApp updates their internals
 * Run automatically via postinstall or manually: node scripts/patch-wwebjs.js
 */

const fs = require("fs");
const path = require("path");

const WWEBJS_PATH = path.join(__dirname, "..", "node_modules", "whatsapp-web.js", "src");

// Patch 1: Client.js - Fix Call module
const clientPath = path.join(WWEBJS_PATH, "Client.js");
if (fs.existsSync(clientPath)) {
  let client = fs.readFileSync(clientPath, "utf8");
  
  const oldCall = `window.Store.Call.on('add', (call) => {
                    window.onIncomingCall(call);
                });`;
  
  const newCall = `// Patched: Check for Call module existence before attaching listener
                if (window.Store.Call && typeof window.Store.Call.on === 'function') {
                    window.Store.Call.on('add', (call) => {
                        window.onIncomingCall(call);
                    });
                }`;
  
  if (client.includes(oldCall)) {
    client = client.replace(oldCall, newCall);
    fs.writeFileSync(clientPath, client);
    console.log("✅ Patched Client.js (Call module)");
  } else if (client.includes("// Patched: Check for Call module")) {
    console.log("⏭️  Client.js already patched");
  } else {
    console.log("⚠️  Client.js: Could not find Call pattern to patch");
  }
} else {
  console.log("❌ Client.js not found");
}

// Patch 2: Utils.js - Fix GroupMetadata and NewsletterMetadataCollection
const utilsPath = path.join(WWEBJS_PATH, "util", "Injected", "Utils.js");
if (fs.existsSync(utilsPath)) {
  let utils = fs.readFileSync(utilsPath, "utf8");
  let patched = false;
  
  // Fix GroupMetadata.update
  const oldGroup = `await window.Store.GroupMetadata.update(chatWid);`;
  const newGroup = `// Patched: Check existence of GroupMetadata before calling update
                if (window.Store.GroupMetadata && typeof window.Store.GroupMetadata.update === 'function') {
                    await window.Store.GroupMetadata.update(chatWid);
                }`;
  
  if (utils.includes(oldGroup) && !utils.includes("// Patched: Check existence of GroupMetadata")) {
    utils = utils.replace(oldGroup, newGroup);
    patched = true;
    console.log("✅ Patched Utils.js (GroupMetadata)");
  }
  
  // Fix NewsletterMetadataCollection.update
  const oldNewsletter = `await window.Store.NewsletterMetadataCollection.update(chat.id);`;
  const newNewsletter = `// Patched: Check existence of NewsletterMetadataCollection before calling update
                if (window.Store.NewsletterMetadataCollection && typeof window.Store.NewsletterMetadataCollection.update === 'function') {
                    await window.Store.NewsletterMetadataCollection.update(chat.id);
                }`;
  
  if (utils.includes(oldNewsletter) && !utils.includes("// Patched: Check existence of NewsletterMetadataCollection")) {
    utils = utils.replace(oldNewsletter, newNewsletter);
    patched = true;
    console.log("✅ Patched Utils.js (NewsletterMetadataCollection)");
  }
  
  if (patched) {
    fs.writeFileSync(utilsPath, utils);
  } else if (utils.includes("// Patched: Check existence of")) {
    console.log("⏭️  Utils.js already patched");
  } else {
    console.log("⚠️  Utils.js: Could not find patterns to patch");
  }
} else {
  console.log("❌ Utils.js not found");
}

console.log("\n🎉 whatsapp-web.js patching complete!");
