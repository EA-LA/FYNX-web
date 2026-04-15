import { auth } from "../../auth/firebase.js";
import { bootstrapSession } from "./session-manager.js";

const protectedPage = document.body?.dataset?.protectedPage !== "false";

bootstrapSession({
  auth,
  protectedPage,
  loginPage: false,
  loginRedirect: "home.html"
}).catch((error) => {
  console.error("Session bootstrap failed", error);
  document.documentElement.classList.remove("fynx-session-booting");
  const boot = document.getElementById("fynxSessionBoot");
  if (boot) boot.remove();
});
