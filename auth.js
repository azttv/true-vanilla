// Firebase Configuration - REPLACE WITH YOUR OWN CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyCKG3JLqE8_QN9X3QRbhXSurING9F-XLL4",
  authDomain: "truevanilla-32c85.firebaseapp.com",
  projectId: "truevanilla-32c85",
  storageBucket: "truevanilla-32c85.firebasestorage.app",
  messagingSenderId: "839667873698",
  appId: "1:839667873698:web:c8d66aa664dd8a0b3e24fb",
};

// Initialize Firebase (only if not already initialized)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Auth State Observer
auth.onAuthStateChanged((user) => {
  updateLoginButton(user);
});

// Update login button based on auth state
function updateLoginButton(user) {
  const loginBtn = document.getElementById("loginBtn");
  if (!loginBtn) return;

  if (user) {
    // Get username from Firestore or use email
    db.collection("users")
      .doc(user.uid)
      .get()
      .then((doc) => {
        const username =
          doc.exists && doc.data().username
            ? doc.data().username
            : user.email.split("@")[0];
        loginBtn.innerHTML = `<i class="fas fa-user"></i><span>${username}</span>`;
        loginBtn.classList.add("user-logged");
        loginBtn.href = "#";
        loginBtn.onclick = (e) => {
          e.preventDefault();
          showUserDropdown(e);
        };
      })
      .catch(() => {
        loginBtn.innerHTML = `<i class="fas fa-user"></i><span>${user.email.split("@")[0]}</span>`;
        loginBtn.classList.add("user-logged");
      });
  } else {
    loginBtn.innerHTML = `<i class="fas fa-user"></i><span>Se connecter</span>`;
    loginBtn.classList.remove("user-logged");
    loginBtn.href = "login.html";
    loginBtn.onclick = null;
  }
}

// Show user dropdown menu
function showUserDropdown(e) {
  // Remove existing dropdown if any
  const existingDropdown = document.getElementById("userDropdown");
  if (existingDropdown) {
    existingDropdown.remove();
    return;
  }

  const dropdown = document.createElement("div");
  dropdown.id = "userDropdown";
  dropdown.className = "user-dropdown";
  dropdown.innerHTML = `
        <div class="dropdown-item" onclick="signOutUser()">
            <i class="fas fa-sign-out-alt"></i>
            Se déconnecter
        </div>
    `;

  const loginBtn = document.getElementById("loginBtn");
  loginBtn.parentElement.appendChild(dropdown);

  // Close dropdown when clicking outside
  setTimeout(() => {
    document.addEventListener("click", closeDropdownOnClickOutside);
  }, 10);
}

function closeDropdownOnClickOutside(e) {
  const dropdown = document.getElementById("userDropdown");
  const loginBtn = document.getElementById("loginBtn");
  if (
    dropdown &&
    !dropdown.contains(e.target) &&
    !loginBtn.contains(e.target)
  ) {
    dropdown.remove();
    document.removeEventListener("click", closeDropdownOnClickOutside);
  }
}

// Sign out user
function signOutUser() {
  auth
    .signOut()
    .then(() => {
      window.location.reload();
    })
    .catch((error) => {
      console.error("Sign out error:", error);
    });
}
