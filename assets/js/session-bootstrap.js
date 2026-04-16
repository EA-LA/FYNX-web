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
});
