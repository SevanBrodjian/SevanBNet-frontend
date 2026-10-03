export const API_URL = import.meta.env.VITE_API_URL;
export const SITE_URL = "https://www.sevanb.net";

// Fetch JSON from the backend API, treating HTTP errors as failures rather than
// letting an error page be parsed as data.
export async function fetchApi(path) {
  const response = await fetch(`${API_URL}/api/${path}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${path}`);
  return response.json();
}
