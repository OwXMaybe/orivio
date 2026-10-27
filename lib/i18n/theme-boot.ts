/** localStorage key for interface preferences (shared with the client provider). */
export const PREFS_KEY = "orivio.prefs.v1";

/**
 * Runs before hydration so the saved theme and language apply without a flash.
 * Lives in a plain module (not "use client") so the server layout gets the actual string.
 */
export const themeBootScript = `try{var p=JSON.parse(localStorage.getItem("${PREFS_KEY}")||"{}");document.documentElement.dataset.theme=p.theme==="light"?"light":"dark";if(p.language==="en"||p.language==="tr")document.documentElement.lang=p.language}catch(e){}`;
