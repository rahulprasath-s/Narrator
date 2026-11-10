let session;
try {
  session = sessionStorage.getItem("narrator-session");
  if (!session) {
    session = crypto.randomUUID();
    sessionStorage.setItem("narrator-session", session);
  }
} catch {
  session = crypto.randomUUID();
}

export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "X-Narrator-Session": session, ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The studio couldn’t read the server response. Check that the Python API is running.",
    );
  }
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Please check the document and settings, then try again.",
    );
  return data;
}
