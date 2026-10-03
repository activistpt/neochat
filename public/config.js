// Default to same-origin so the app works on whatever host it is deployed to
// (Render, Railway, localhost, ...) without editing this file. To point at a
// separate backend, set window.CHAT_SERVER_URL in index.html BEFORE this loads.
window.CHAT_SERVER_URL = window.CHAT_SERVER_URL || window.location.origin;
