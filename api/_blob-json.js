const { get, put, list } = require("@vercel/blob");
const { BlobServiceClient } = require("@azure/storage-blob");

const STORAGE_BACKEND = (process.env.STORAGE_BACKEND || "vercel").trim().toLowerCase();

function getBlobAccessMode() {
  return process.env.BLOB_ACCESS_MODE === "private" ? "private" : "public";
}

function getAzureContainerClient() {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const container = process.env.AZURE_STORAGE_CONTAINER || "jet-portal";
  if (!connStr) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
  return BlobServiceClient.fromConnectionString(connStr).getContainerClient(container);
}

async function readStreamAsText(stream) {
  if (!stream) return "";
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  }
  if (typeof Response === "function") {
    return await new Response(stream).text();
  }
  throw new Error("Unsupported blob stream type.");
}

async function getJsonBlob(pathname) {
  if (STORAGE_BACKEND === "azure") {
    const client = getAzureContainerClient().getBlobClient(pathname);
    try {
      const buffer = await client.downloadToBuffer();
      return { data: JSON.parse(buffer.toString("utf-8")), blob: null };
    } catch (err) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  // Vercel Blob logic: 
  // 1. Find the blob by its pathname using list() to get its current URL.
  // We use prefix matching and find exact pathname because Vercel Blobs are immutable with unique URLs.
  const { blobs } = await list({ prefix: pathname });
  const blobInfo = blobs.find(b => b.pathname === pathname);

  if (!blobInfo) return null;

  // 2. Fetch the JSON content from the resolved URL.
  const res = await fetch(blobInfo.url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch blob content (${res.status})`);
  }

  const data = await res.json();
  return { data, blob: blobInfo };
}

async function putJsonBlob(pathname, payload) {
  if (STORAGE_BACKEND === "azure") {
    const json = JSON.stringify(payload);
    const client = getAzureContainerClient().getBlockBlobClient(pathname);
    await client.upload(json, Buffer.byteLength(json), {
      blobHTTPHeaders: { blobContentType: "application/json" }
    });
    return;
  }
  return await put(pathname, JSON.stringify(payload), {
    access: getBlobAccessMode(),
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

async function listBlobs(prefix) {
  if (STORAGE_BACKEND === "azure") {
    const container = getAzureContainerClient();
    const items = [];
    for await (const blob of container.listBlobsFlat({ prefix })) {
      items.push({
        pathname: blob.name,
        uploadedAt: blob.properties.lastModified?.toISOString() || ""
      });
    }
    return items;
  }
  const { blobs } = await list({ prefix });
  return blobs.map(b => ({ pathname: b.pathname, uploadedAt: b.uploadedAt }));
}

module.exports = { getBlobAccessMode, getJsonBlob, putJsonBlob, listBlobs };
