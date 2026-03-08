const { get, put } = require("@vercel/blob");

function getBlobAccessMode() {
  return process.env.BLOB_ACCESS_MODE === "private" ? "private" : "public";
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
  const result = await get(pathname, { access: getBlobAccessMode() });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await readStreamAsText(result.stream);
  return {
    data: JSON.parse(text),
    blob: result.blob
  };
}

async function putJsonBlob(pathname, payload) {
  return await put(pathname, JSON.stringify(payload), {
    access: getBlobAccessMode(),
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

module.exports = {
  getBlobAccessMode,
  getJsonBlob,
  putJsonBlob
};
